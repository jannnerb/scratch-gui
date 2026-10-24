import BlockItem from "./blockly/BlockItem.js";
import BlockInstance from "./blockly/BlockInstance.js";
import Utils from "./blockly/Utils.js";

export default async function ({ addon, msg, console }) {
  const Blockly = await addon.tab.traps.getBlockly();

  const SCOPE_STORAGE_KEY = "tw:find-bar:scope";

  /** @returns {"sprite"|"project"} */
  const loadScope = () => {
    try {
      return localStorage.getItem(SCOPE_STORAGE_KEY) === "project" ? "project" : "sprite";
    } catch (e) {
      return "sprite";
    }
  };

  const saveScope = (scope) => {
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    } catch (e) {
      // Storage unavailable; the choice just won't be remembered.
    }
  };

  /**
   * msg() with an English fallback, so the new strings work even before they are added to the locale file.
   */
  const t = (key, fallback) => {
    try {
      const value = msg(key);
      return !value || value === key || value.includes(key) ? fallback : value;
    } catch (e) {
      return fallback;
    }
  };

  /** "A, B, C" or "A, B +3" */
  const formatNames = (names) => {
    const list = [...names];
    if (list.length === 0) return "";
    return list.length <= 3 ? list.join(", ") : `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
  };

  if (!document.getElementById("sa-find-scope-style")) {
    const style = document.createElement("style");
    style.id = "sa-find-scope-style";
    style.textContent = `
      .sa-find-scope {
        margin-left: 4px;
        align-self: center;
        padding: 0.3rem 0.65rem;
        border: 1px solid rgba(128, 128, 128, 0.55);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 0.75rem;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
      }
      .sa-find-scope:hover { background: rgba(128, 128, 128, 0.18); }
      .sa-find-scope[aria-pressed="true"] {
        background: rgba(76, 151, 255, 0.28);
        border-color: #4c97ff;
      }
      .sa-find-suffix { opacity: 0.65; font-size: 0.85em; margin-left: 0.6em; }
      .sa-find-carousel-target { margin-left: 0.5em; opacity: 0.8; font-size: 0.85em; }
    `;
    document.head.appendChild(style);
  }

  class FindBar {
    constructor() {
      this.utils = new Utils(addon);

      this.prevValue = "";

      /** @type {"sprite"|"project"} Whether to search only the current sprite, or every sprite */
      this.scope = loadScope();
      this.scopeButton = null;

      this.findBarOuter = null;
      this.findWrapper = null;
      this.findInput = null;
      this.dropdownOut = null;
      this.dropdown = new Dropdown(this.utils);

      document.addEventListener("keydown", (e) => this.eventKeyDown(e), true);
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom(root) {
      this.findBarOuter = document.createElement("div");
      this.findBarOuter.className = "sa-find-bar";
      addon.tab.displayNoneWhileDisabled(this.findBarOuter, { display: "flex" });
      root.appendChild(this.findBarOuter);

      this.findWrapper = this.findBarOuter.appendChild(document.createElement("span"));
      this.findWrapper.className = "sa-find-wrapper";

      this.dropdownOut = this.findWrapper.appendChild(document.createElement("label"));
      this.dropdownOut.className = "sa-find-dropdown-out";

      this.findInput = this.dropdownOut.appendChild(document.createElement("input"));
      this.findInput.className = addon.tab.scratchClass("input_input-form", {
        others: "sa-find-input",
      });
      // for <label>
      this.findInput.id = "sa-find-input";
      this.findInput.type = "search";
      this.findInput.placeholder = msg("find-placeholder");
      this.findInput.autocomplete = "off";

      this.dropdownOut.appendChild(this.dropdown.createDom());

      this.scopeButton = this.findBarOuter.appendChild(document.createElement("button"));
      this.scopeButton.type = "button";
      this.scopeButton.className = "sa-find-scope";
      // mousedown + preventDefault so clicking the button doesn't blur the search box (which would close the list)
      this.scopeButton.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.toggleScope();
      });
      // Keyboard activation (Enter/Space) arrives as a click with no pointer (detail === 0)
      this.scopeButton.addEventListener("click", (e) => {
        if (e.detail === 0) this.toggleScope();
      });
      this.updateScopeButton();

      this.bindEvents();
      this.tabChanged();
    }

    bindEvents() {
      this.findInput.addEventListener("focus", () => this.inputChange());
      this.findInput.addEventListener("keydown", (e) => this.inputKeyDown(e));
      this.findInput.addEventListener("keyup", () => this.inputChange());
      this.findInput.addEventListener("focusout", () => this.hideDropDown());
    }

    tabChanged() {
      if (!this.findBarOuter) {
        return;
      }
      const tab = addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
      const visible = tab === 0 || tab === 1 || tab === 2;
      this.findBarOuter.hidden = !visible;
    }

    inputChange() {
      this.showDropDown();

      // Filter the list...
      let val = (this.findInput.value || "").toLowerCase();
      if (val === this.prevValue) {
        // No change so don't re-filter
        return;
      }
      this.prevValue = val;

      this.dropdown.blocks = null;

      // Hide items in list that do not contain filter text
      let listLI = this.dropdown.items;
      for (const li of listLI) {
        let procCode = li.data.procCode;
        let i = li.data.lower.indexOf(val);
        if (i >= 0) {
          li.style.display = "block";
          while (li.firstChild) {
            li.removeChild(li.firstChild);
          }
          if (i > 0) {
            li.appendChild(document.createTextNode(procCode.substring(0, i)));
          }
          let bText = document.createElement("b");
          bText.appendChild(document.createTextNode(procCode.substr(i, val.length)));
          li.appendChild(bText);
          if (i + val.length < procCode.length) {
            li.appendChild(document.createTextNode(procCode.substr(i + val.length)));
          }
          if (li.data.suffix) {
            li.appendChild(this.dropdown.createSuffix(li.data.suffix));
          }
        } else {
          li.style.display = "none";
        }
      }
    }

    inputKeyDown(e) {
      this.dropdown.inputKeyDown(e);

      // Enter
      if (e.key === "Enter") {
        this.findInput.blur();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        if (this.findInput.value.length > 0) {
          this.findInput.value = ""; // Clear search first, then close on second press
          this.inputChange();
        } else {
          this.findInput.blur();
        }
        e.preventDefault();
        return;
      }
    }

    eventKeyDown(e) {
      if (addon.self.disabled || !this.findBarOuter) return;

      let ctrlKey = e.ctrlKey || e.metaKey;

      if (e.key.toLowerCase() === "f" && ctrlKey && !e.shiftKey) {
        // Ctrl + F (Override default Ctrl+F find)
        this.findInput.focus();
        this.findInput.select();
        e.cancelBubble = true;
        e.preventDefault();
        return true;
      }

      if (e.key === "ArrowLeft" && ctrlKey) {
        // Ctrl + Left Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goBack();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }

      if (e.key === "ArrowRight" && ctrlKey) {
        // Ctrl + Right Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goForward();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }
    }

    showDropDown(focusID, instanceBlock) {
      if (!focusID && this.dropdownOut.classList.contains("visible")) {
        return;
      }

      // special '' vs null... - null forces a reevaluation
      this.prevValue = focusID ? "" : null; // Clear the previous value of the input search

      this.dropdownOut.classList.add("visible");
      this.rebuildItems(focusID, instanceBlock);

      this.utils.offsetX = this.dropdownOut.getBoundingClientRect().width + 32;
      this.utils.offsetY = 32;
    }

    /**
     * (Re)populate the dropdown for the current tab and search scope.
     * @param focusID if given (middle-click jump), only the matching item is kept and selected
     * @param instanceBlock the specific block that was middle-clicked
     */
    rebuildItems(focusID, instanceBlock) {
      // Middle-click jumps resolve against the Blockly workspace you clicked in, so they always use sprite scope.
      const project = !focusID && this.scope === "project";
      const tab = this.selectedTab;

      let scratchBlocks = [];
      if (tab === 0) {
        scratchBlocks = project ? this.getProjectBlocks() : this.getScratchBlocks();
      } else if (tab === 1) {
        scratchBlocks = project ? this.getProjectAssets("costume") : this.getScratchCostumes();
      } else if (tab === 2) {
        scratchBlocks = project ? this.getProjectAssets("sound") : this.getScratchSounds();
      }

      this.dropdown.empty();

      for (const proc of scratchBlocks) {
        let item = this.dropdown.addItem(proc);

        if (focusID) {
          if (proc.matchesID(focusID)) {
            this.dropdown.onItemClick(item, instanceBlock);
          } else {
            item.style.display = "none";
          }
        }
      }
    }

    updateScopeButton() {
      if (!this.scopeButton) return;
      const project = this.scope === "project";
      this.scopeButton.textContent = project
        ? t("find-scope-project", "Whole project")
        : t("find-scope-sprite", "This sprite");
      this.scopeButton.title = project
        ? t("find-scope-project-title", "Searching every sprite. Click to search only this sprite.")
        : t("find-scope-sprite-title", "Searching this sprite. Click to search the whole project.");
      this.scopeButton.setAttribute("aria-pressed", String(project));
    }

    toggleScope() {
      this.scope = this.scope === "project" ? "sprite" : "project";
      saveScope(this.scope);
      this.updateScopeButton();

      if (this.dropdownOut.classList.contains("visible")) {
        // Rebuild in place and re-apply whatever is typed in the box
        this.dropdown.carousel.remove();
        this.rebuildItems();
        this.prevValue = null;
        this.inputChange();
      } else {
        // Focusing the box opens the list, built with the new scope
        this.findInput.focus();
      }
    }

    hideDropDown() {
      this.dropdownOut.classList.remove("visible");
    }

    get selectedTab() {
      return addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
    }

    getScratchBlocks() {
      let myBlocks = [];
      let myBlocksByProcCode = {};

      let topBlocks = this.workspace.getTopBlocks();

      /**
       * @param cls
       * @param txt
       * @param root
       * @returns BlockItem
       */
      function addBlock(cls, txt, root) {
        let id = root.id ? root.id : root.getId ? root.getId() : null;
        let clone = myBlocksByProcCode[txt];
        if (clone) {
          if (!clone.clones) {
            clone.clones = [];
          }
          clone.clones.push(id);
          return clone;
        }
        let items = new BlockItem(cls, txt, id, 0);
        items.y = root.getRelativeToSurfaceXY ? root.getRelativeToSurfaceXY().y : null;
        myBlocks.push(items);
        myBlocksByProcCode[txt] = items;
        return items;
      }

      function getDescFromField(root) {
        let fields = root.inputList[0];
        let desc;
        for (const fieldRow of fields.fieldRow) {
          desc = desc ? desc + " " : "";
          if (fieldRow instanceof Blockly.FieldImage && fieldRow.src_.endsWith("green-flag.svg")) {
            desc += msg("/_general/blocks/green-flag");
          } else {
            desc += fieldRow.getText();
          }
        }
        return desc;
      }

      for (const root of topBlocks) {
        if (root.type === "procedures_definition") {
          const label = root.getChildren()[0];
          const procCode = label.getProcCode();
          if (!procCode) {
            continue;
          }
          const indexOfLabel = root.inputList.findIndex((i) => i.fieldRow.length > 0);
          if (indexOfLabel === -1) {
            continue;
          }
          const translatedDefine = root.inputList[indexOfLabel].fieldRow[0].getText();
          const message = indexOfLabel === 0 ? `${translatedDefine} ${procCode}` : `${procCode} ${translatedDefine}`;
          addBlock("define", message, root);
          continue;
        }

        if (root.type === "event_whenflagclicked") {
          addBlock("flag", getDescFromField(root), root); // "When Flag Clicked"
          continue;
        }

        if (root.type === "event_whenbroadcastreceived") {
          const fieldRow = root.inputList[0].fieldRow;
          let eventName = fieldRow.find((input) => input.name === "BROADCAST_OPTION").getText();
          addBlock("receive", msg("event", { name: eventName }), root).eventName = eventName;

          continue;
        }

        if (root.type.substr(0, 10) === "event_when") {
          addBlock("event", getDescFromField(root), root); // "When Flag Clicked"
          continue;
        }

        if (root.type === "control_start_as_clone") {
          addBlock("event", getDescFromField(root), root); // "when I start as a clone"
          continue;
        }
      }

      let map = this.workspace.getVariableMap();

      let vars = map.getVariablesOfType("");
      for (const row of vars) {
        addBlock(
          row.isLocal ? "var" : "VAR",
          row.isLocal ? msg("var-local", { name: row.name }) : msg("var-global", { name: row.name }),
          row
        );
      }

      let lists = map.getVariablesOfType("list");
      for (const row of lists) {
        addBlock(
          row.isLocal ? "list" : "LIST",
          row.isLocal ? msg("list-local", { name: row.name }) : msg("list-global", { name: row.name }),
          row
        );
      }

      const events = this.getCallsToEvents();
      for (const event of events) {
        addBlock("receive", msg("event", { name: event.eventName }), event.block).eventName = event.eventName;
      }

      const clsOrder = { flag: 0, receive: 1, event: 2, define: 3, var: 4, VAR: 5, list: 6, LIST: 7 };

      myBlocks.sort((a, b) => {
        let t = clsOrder[a.cls] - clsOrder[b.cls];
        if (t !== 0) {
          return t;
        }
        if (a.lower < b.lower) {
          return -1;
        }
        if (a.lower > b.lower) {
          return 1;
        }
        return a.y - b.y;
      });

      return myBlocks;
    }

    /**
     * Every original (non-clone) sprite plus the stage, with the sprite currently being edited first
     */
    getOrderedTargets() {
      const currentId = this.utils.getEditingTarget()?.id;
      return this.utils.vm.runtime.targets
        .filter((target) => target.isOriginal)
        .sort((a, b) => (a.id === currentId ? 0 : 1) - (b.id === currentId ? 0 : 1));
    }

    /**
     * Same kinds of results as getScratchBlocks(), but gathered from the VM for every sprite, since the Blockly
     * workspace only ever contains the sprite being edited. Each result carries every matching block (with the
     * sprite it lives in) so the carousel can hop between sprites.
     */
    getProjectBlocks() {
      const targets = this.getOrderedTargets();
      const items = new Map();

      const getItem = (cls, label, trackInstances = true) => {
        const key = `${cls}\u0000${label}`;
        let item = items.get(key);
        if (!item) {
          item = new BlockItem(cls, label, null, 0);
          item.matchIds = new Set();
          item.targetNames = new Set();
          if (trackInstances) item.instances = [];
          items.set(key, item);
        }
        return item;
      };

      const addInstance = (item, target, block) => {
        item.instances.push(new BlockInstance(target, block));
        item.matchIds.add(block.id);
        item.targetNames.add(target.getName());
        if (!item.labelID) item.labelID = block.id;
      };

      /** Replace %1, %2... in a Blockly message template */
      const fill = (template, args) => template.replace(/%(\d+)/g, (_, n) => (args[n - 1] === undefined ? "" : args[n - 1]));

      /** Dropdown/field values of a hat block, in the order they appear in its label */
      const hatArgs = (block, blocks) => {
        const args = [];
        for (const field of Object.values(block.fields || {})) args.push(field.value);
        for (const input of Object.values(block.inputs || {})) {
          const child = blocks[input.block];
          const field = child && Object.values(child.fields || {})[0];
          if (field) args.push(field.value);
        }
        return args;
      };

      // ---- Pass 1: variables and lists
      const globalVars = new Map(); // variable id -> item
      const localVars = new Map(); // target id -> Map(variable id -> item)
      for (const target of targets) {
        for (const variable of Object.values(target.variables)) {
          let cls;
          if (variable.type === "") cls = target.isStage ? "VAR" : "var";
          else if (variable.type === "list") cls = target.isStage ? "LIST" : "list";
          else continue; // broadcast messages etc.

          const messageKey = cls === "var" ? "var-local" : cls === "VAR" ? "var-global" : cls === "list" ? "list-local" : "list-global";
          const item = getItem(cls, msg(messageKey, { name: variable.name }));
          item.matchIds.add(variable.id);
          if (!item.labelID) item.labelID = variable.id;
          if (!target.isStage) item.targetNames.add(target.getName());

          if (target.isStage) {
            globalVars.set(variable.id, item);
          } else {
            if (!localVars.has(target.id)) localVars.set(target.id, new Map());
            localVars.get(target.id).set(variable.id, item);
          }
        }
      }

      // ---- Pass 2: scripts, procedures, broadcasts and variable uses
      const defineByCode = new Map(); // proccode -> item
      const calls = []; // { code, target, block }

      for (const target of targets) {
        const blocks = target.blocks._blocks;
        if (!blocks) continue;
        const locals = localVars.get(target.id);

        for (const block of Object.values(blocks)) {
          const op = block.opcode;

          // Variable / list uses
          const varField = block.fields && (block.fields.VARIABLE || block.fields.LIST);
          if (varField && varField.id) {
            const variableItem = (locals && locals.get(varField.id)) || globalVars.get(varField.id);
            if (variableItem) addInstance(variableItem, target, block);
            continue;
          }

          // Calls to custom blocks (attached to their definition afterwards)
          if (op === "procedures_call") {
            if (block.mutation && block.mutation.proccode) {
              calls.push({ code: block.mutation.proccode, target, block });
            }
            continue;
          }

          // Broadcast senders only contribute the event name; the carousel for these is built from the VM
          if (op === "event_broadcast" || op === "event_broadcastandwait") {
            const input = block.inputs && block.inputs.BROADCAST_INPUT;
            const menu = input && blocks[input.block];
            if (menu) {
              const name = menu.opcode === "event_broadcast_menu" ? menu.fields.BROADCAST_OPTION.value : msg("complex-broadcast");
              getItem("receive", msg("event", { name }), false).eventName = name;
            }
            continue;
          }

          if (!block.topLevel) continue;

          if (op === "procedures_definition") {
            const prototype = blocks[block.inputs && block.inputs.custom_block && block.inputs.custom_block.block];
            const procCode = prototype && prototype.mutation && prototype.mutation.proccode;
            if (!procCode) continue;
            const item = getItem("define", fill(Blockly.Msg.PROCEDURES_DEFINITION || "define %1", [procCode]));
            defineByCode.set(procCode, item);
            addInstance(item, target, block);
            continue;
          }

          if (op === "event_whenbroadcastreceived") {
            const name = block.fields.BROADCAST_OPTION.value;
            getItem("receive", msg("event", { name }), false).eventName = name;
            continue;
          }

          let cls = null;
          let label = null;
          if (op === "event_whenflagclicked") {
            cls = "flag";
            label = fill(Blockly.Msg.EVENT_WHENFLAGCLICKED || "when %1 clicked", [msg("/_general/blocks/green-flag")]);
          } else if (op === "control_start_as_clone") {
            cls = "event";
            label = Blockly.Msg.CONTROL_STARTASCLONE || "when I start as a clone";
          } else if (op.startsWith("event_when")) {
            cls = "event";
            label = fill(Blockly.Msg[op.toUpperCase()] || op.replace("event_", ""), hatArgs(block, blocks));
          }
          if (cls) addInstance(getItem(cls, label), target, block);
        }
      }

      // Calls come after definitions, so the carousel starts on a definition
      for (const call of calls) {
        const item = defineByCode.get(call.code);
        if (item) addInstance(item, call.target, call.block);
      }

      const result = [...items.values()];
      for (const item of result) {
        item.suffix = formatNames(item.targetNames);
      }

      const clsOrder = { flag: 0, receive: 1, event: 2, define: 3, var: 4, VAR: 5, list: 6, LIST: 7 };
      result.sort((a, b) => {
        const order = clsOrder[a.cls] - clsOrder[b.cls];
        if (order !== 0) return order;
        if (a.lower < b.lower) return -1;
        if (a.lower > b.lower) return 1;
        return 0;
      });
      return result;
    }

    /**
     * Costumes (or backdrops) / sounds of every sprite, current sprite first
     * @param kind {"costume"|"sound"}
     */
    getProjectAssets(kind) {
      const items = [];
      for (const target of this.getOrderedTargets()) {
        const assets = kind === "costume" ? target.getCostumes() : target.getSounds();
        assets.forEach((asset, index) => {
          const item = new BlockItem(kind, asset.name, asset.assetId, index);
          item.targetId = target.id;
          item.suffix = target.getName();
          items.push(item);
        });
      }
      return items;
    }

    getScratchCostumes() {
      let costumes = this.utils.getEditingTarget().getCostumes();

      let items = [];

      let i = 0;
      for (const costume of costumes) {
        let item = new BlockItem("costume", costume.name, costume.assetId, i);
        items.push(item);
        i++;
      }

      return items;
    }

    getScratchSounds() {
      let sounds = this.utils.getEditingTarget().getSounds();

      let items = [];

      let i = 0;
      for (const sound of sounds) {
        let item = new BlockItem("sound", sound.name, sound.assetId, i);
        items.push(item);
        i++;
      }

      return items;
    }

    getCallsToEvents() {
      const uses = [];
      const alreadyFound = new Set();

      for (const block of this.workspace.getAllBlocks()) {
        if (block.type !== "event_broadcast" && block.type !== "event_broadcastandwait") {
          continue;
        }

        const broadcastInput = block.getChildren()[0];
        if (!broadcastInput) {
          continue;
        }

        let eventName = "";
        if (broadcastInput.type === "event_broadcast_menu") {
          eventName = broadcastInput.inputList[0].fieldRow[0].getText();
        } else {
          eventName = msg("complex-broadcast");
        }
        if (!alreadyFound.has(eventName)) {
          alreadyFound.add(eventName);
          uses.push({ eventName: eventName, block: block });
        }
      }

      return uses;
    }
  }

  class Dropdown {
    constructor(utils) {
      this.utils = utils;

      this.el = null;
      this.items = [];
      this.selected = null;
      this.carousel = new Carousel(this.utils);
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom() {
      this.el = document.createElement("ul");
      this.el.className = "sa-find-dropdown";
      return this.el;
    }

    inputKeyDown(e) {
      // Up Arrow
      if (e.key === "ArrowUp") {
        this.navigateFilter(-1);
        e.preventDefault();
        return;
      }

      // Down Arrow
      if (e.key === "ArrowDown") {
        this.navigateFilter(1);
        e.preventDefault();
        return;
      }

      // Enter
      if (e.key === "Enter") {
        // Any selected on enter? if not select now
        if (this.selected) {
          this.navigateFilter(1);
        }
        e.preventDefault();
        return;
      }

      this.carousel.inputKeyDown(e);
    }

    navigateFilter(dir) {
      let nxt;
      if (this.selected && this.selected.style.display !== "none") {
        nxt = dir === -1 ? this.selected.previousSibling : this.selected.nextSibling;
      } else {
        nxt = this.items[0];
        dir = 1;
      }
      while (nxt && nxt.style.display === "none") {
        nxt = dir === -1 ? nxt.previousSibling : nxt.nextSibling;
      }
      if (nxt) {
        nxt.scrollIntoView({ block: "nearest" });
        this.onItemClick(nxt);
      }
    }

    createSuffix(text) {
      const suffix = document.createElement("span");
      suffix.className = "sa-find-suffix";
      suffix.textContent = text;
      return suffix;
    }

    addItem(proc) {
      const item = document.createElement("li");
      item.innerText = proc.procCode;
      if (proc.suffix) {
        item.appendChild(this.createSuffix(proc.suffix));
      }
      item.data = proc;
      const colorIds = {
        receive: "events",
        event: "events",
        define: "more",
        var: "data",
        VAR: "data",
        list: "data-lists",
        LIST: "data-lists",
        costume: "looks",
        sound: "sounds",
      };
      if (proc.cls === "flag") {
        item.className = "sa-find-flag";
      } else {
        const colorId = colorIds[proc.cls];
        item.className = `sa-block-color sa-block-color-${colorId}`;
      }
      item.addEventListener("mousedown", (e) => {
        this.onItemClick(item);
        e.preventDefault();
        e.cancelBubble = true;
        return false;
      });
      this.items.push(item);
      this.el.appendChild(item);
      return item;
    }

    onItemClick(item, instanceBlock) {
      if (this.selected && this.selected !== item) {
        this.selected.classList.remove("sel");
        this.selected = null;
      }
      if (this.selected !== item) {
        item.classList.add("sel");
        this.selected = item;
      }

      let cls = item.data.cls;
      if (cls === "costume" || cls === "sound") {
        // Viewing costumes/sounds - jump to selected costume/sound
        this.jumpToAsset(item);
      } else if (item.data.instances) {
        // Project scope: we already know every matching block in every sprite
        this.carousel.build(item, item.data.instances, instanceBlock);
      } else if (cls === "var" || cls === "VAR" || cls === "list" || cls === "LIST") {
        // Search now for all instances
        let blocks = this.getVariableUsesById(item.data.labelID);
        this.carousel.build(item, blocks, instanceBlock);
      } else if (cls === "define") {
        let blocks = this.getCallsToProcedureById(item.data.labelID);
        this.carousel.build(item, blocks, instanceBlock);
      } else if (cls === "receive") {
        /*
          let blocks = [this.workspace.getBlockById(li.data.labelID)];
          if (li.data.clones) {
              for (const cloneID of li.data.clones) {
                  blocks.push(this.workspace.getBlockById(cloneID))
              }
          }
          blocks = blocks.concat(getCallsToEventsByName(li.data.eventName));
        */
        // Now, fetch the events from the scratch runtime instead of blockly
        let blocks = this.getCallsToEventsByName(item.data.eventName);
        if (!instanceBlock) {
          // Can we start by selecting the first block on 'this' sprite
          const currentTargetID = this.utils.getEditingTarget().id;
          for (const block of blocks) {
            if (block.targetId === currentTargetID) {
              instanceBlock = block;
              break;
            }
          }
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else if (item.data.clones) {
        let blocks = [this.workspace.getBlockById(item.data.labelID)];
        for (const cloneID of item.data.clones) {
          blocks.push(this.workspace.getBlockById(cloneID));
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else {
        this.utils.scrollBlockIntoView(item.data.labelID);
        this.carousel.remove();
      }
    }

    async jumpToAsset(item) {
      const { targetId, y: index } = item.data;

      if (targetId && this.utils.getEditingTarget().id !== targetId) {
        // Asset belongs to another sprite: switch, then give the asset panel a moment to re-render
        this.utils.setEditingTarget(targetId);
        await this.utils.nextFrames(3);
        if (this.selected !== item) return; // Selection moved on while we waited
      }

      const assetPanel = document.querySelector("[class^=asset-panel_wrapper]");
      if (assetPanel) {
        const reactInstance = assetPanel[addon.tab.traps.getInternalKey(assetPanel)];
        const reactProps = reactInstance.child.stateNode.props;
        reactProps.onItemClick(index);
        const selectorList = assetPanel.firstChild.firstChild;
        selectorList.children[index].scrollIntoView({
          behavior: "auto",
          block: "center",
          inline: "start",
        });
        // The wrapper seems to scroll when we use the function above.
        let wrapper = assetPanel.closest("div[class*=gui_flex-wrapper]");
        wrapper.scrollTop = 0;
      }
    }

    getVariableUsesById(id) {
      let uses = [];

      let topBlocks = this.workspace.getTopBlocks();
      for (const topBlock of topBlocks) {
        /** @type {!Array<!Blockly.Block>} */
        let kids = topBlock.getDescendants();
        for (const block of kids) {
          /** @type {!Array<!Blockly.VariableModel>} */
          let blockVariables = block.getVarModels();
          if (blockVariables) {
            for (const blockVar of blockVariables) {
              if (blockVar.getId() === id) {
                uses.push(block);
              }
            }
          }
        }
      }

      return uses;
    }

    getCallsToProcedureById(id) {
      let procBlock = this.workspace.getBlockById(id);
      let label = procBlock.getChildren()[0];
      let procCode = label.getProcCode();

      let uses = [procBlock]; // Definition First, then calls to it
      let topBlocks = this.workspace.getTopBlocks();
      for (const topBlock of topBlocks) {
        /** @type {!Array<!Blockly.Block>} */
        let kids = topBlock.getDescendants();
        for (const block of kids) {
          if (block.type === "procedures_call") {
            if (block.getProcCode() === procCode) {
              uses.push(block);
            }
          }
        }
      }

      return uses;
    }

    getCallsToEventsByName(name) {
      let uses = []; // Definition First, then calls to it

      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets; // The sprites / stage

      for (const target of targets) {
        if (!target.isOriginal) {
          continue; // Skip clones
        }

        const blocks = target.blocks;
        if (!blocks._blocks) {
          continue;
        }

        for (const id of Object.keys(blocks._blocks)) {
          const block = blocks._blocks[id];
          if (block.opcode === "event_whenbroadcastreceived" && block.fields.BROADCAST_OPTION.value === name) {
            uses.push(new BlockInstance(target, block));
          } else if (block.opcode === "event_broadcast" || block.opcode === "event_broadcastandwait") {
            const broadcastInputBlockId = block.inputs.BROADCAST_INPUT.block;
            const broadcastInputBlock = blocks._blocks[broadcastInputBlockId];
            if (broadcastInputBlock) {
              let eventName;
              if (broadcastInputBlock.opcode === "event_broadcast_menu") {
                eventName = broadcastInputBlock.fields.BROADCAST_OPTION.value;
              } else {
                eventName = msg("complex-broadcast");
              }
              if (eventName === name) {
                uses.push(new BlockInstance(target, block));
              }
            }
          }
        }
      }

      return uses;
    }

    empty() {
      for (const item of this.items) {
        if (this.el.contains(item)) {
          this.el.removeChild(item);
        }
      }
      this.items = [];
      this.selected = null;
    }
  }

  class Carousel {
    constructor(utils) {
      this.utils = utils;

      this.el = null;
      this.count = null;
      this.blocks = [];
      this.idx = 0;
    }

    build(item, blocks, instanceBlock) {
      if (this.el && this.el.parentNode === item) {
        // Same control... click again to go to next
        this.navRight();
      } else {
        this.remove();
        this.blocks = blocks;
        item.appendChild(this.createDom());

        this.idx = 0;
        if (instanceBlock) {
          for (const idx of Object.keys(this.blocks)) {
            const block = this.blocks[idx];
            if (block.id === instanceBlock.id) {
              this.idx = Number(idx);
              break;
            }
          }
        }

        this.updateCount();
        if (this.idx < this.blocks.length) {
          this.utils.scrollBlockIntoView(this.blocks[this.idx]);
        }
      }
    }

    createDom() {
      this.el = document.createElement("span");
      this.el.className = "sa-find-carousel";

      const leftControl = this.el.appendChild(document.createElement("span"));
      leftControl.className = "sa-find-carousel-control";
      leftControl.textContent = "◀";
      leftControl.addEventListener("mousedown", (e) => this.navLeft(e));

      this.count = this.el.appendChild(document.createElement("span"));
      this.count.innerText = this.blocks.length > 0 ? this.idx + 1 + " / " + this.blocks.length : "0";

      const rightControl = this.el.appendChild(document.createElement("span"));
      rightControl.className = "sa-find-carousel-control";
      rightControl.textContent = "▶";
      rightControl.addEventListener("mousedown", (e) => this.navRight(e));

      // Which sprite the current block is in (only for blocks found via the VM, which can be in any sprite)
      this.targetLabel = this.el.appendChild(document.createElement("span"));
      this.targetLabel.className = "sa-find-carousel-target";

      return this.el;
    }

    inputKeyDown(e) {
      // Left Arrow
      if (e.key === "ArrowLeft") {
        if (this.el && this.blocks) {
          this.navLeft(e);
        }
      }

      // Right Arrow
      if (e.key === "ArrowRight") {
        if (this.el && this.blocks) {
          this.navRight(e);
        }
      }
    }

    updateCount() {
      if (!this.count) return;
      this.count.innerText = this.blocks.length > 0 ? this.idx + 1 + " / " + this.blocks.length : "0";
      const current = this.blocks[this.idx];
      this.targetLabel.textContent = current instanceof BlockInstance ? this.utils.getTargetName(current.targetId) : "";
    }

    navLeft(e) {
      return this.navSideways(e, -1);
    }

    navRight(e) {
      return this.navSideways(e, 1);
    }

    navSideways(e, dir) {
      if (this.blocks.length > 0) {
        this.idx = (this.idx + dir + this.blocks.length) % this.blocks.length; // + length to fix negative modulo js issue.
        this.updateCount();
        this.utils.scrollBlockIntoView(this.blocks[this.idx]);
      }

      if (e) {
        e.cancelBubble = true;
        e.preventDefault();
      }
    }

    remove() {
      if (this.el) {
        this.el.remove();
        this.blocks = [];
        this.idx = 0;
      }
    }
  }

  const findBar = new FindBar();

  const _doBlockClick_ = Blockly.Gesture.prototype.doBlockClick_;
  Blockly.Gesture.prototype.doBlockClick_ = function () {
    if (!addon.self.disabled && (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey)) {
      // Wheel button...
      // Intercept clicks to allow jump to...?
      let block = this.startBlock_;
      for (; block; block = block.getSurroundParent()) {
        if (block.type === "procedures_definition" || (!this.jumpToDef && block.type === "procedures_call")) {
          let id = block.id ? block.id : block.getId ? block.getId() : null;

          findBar.findInput.focus();
          findBar.showDropDown(id);

          return;
        }

        if (
          block.type === "data_variable" ||
          block.type === "data_changevariableby" ||
          block.type === "data_setvariableto"
        ) {
          let id = block.getVars()[0];

          findBar.findInput.focus();
          findBar.showDropDown(id, block);

          findBar.selVarID = id;

          return;
        }

        if (
          block.type === "event_whenbroadcastreceived" ||
          block.type === "event_broadcastandwait" ||
          block.type === "event_broadcast"
        ) {
          // todo: actually index the broadcasts...!
          let id = block.id;

          findBar.findInput.focus();
          findBar.showDropDown(id, block);

          findBar.selVarID = id;

          return;
        }
      }
    }

    _doBlockClick_.call(this);
  };

  addon.tab.redux.initialize();
  addon.tab.redux.addEventListener("statechanged", (e) => {
    if (e.detail.action.type === "scratch-gui/navigation/ACTIVATE_TAB") {
      findBar.tabChanged();
    }
  });

  while (true) {
    const root = await addon.tab.waitForElement("ul[class*=gui_tab-list_]", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });
    findBar.createDom(root);
  }
}