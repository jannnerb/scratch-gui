import BlockInstance from "./BlockInstance.js";
import BlockFlasher from "./BlockFlasher.js";

// Make these global so that every addon uses the same arrays.
let views = [];
let forward = [];
export default class Utils {
  constructor(addon) {
    this.addon = addon;
    this.addon.tab.traps.getBlockly().then((blockly) => {
      this.blockly = blockly;
    });
    /**
     * Scratch Virtual Machine
     * @type {null|*}
     */
    this.vm = this.addon.tab.traps.vm;
    // this._myFlash = { block: null, timerID: null, colour: null };
    this.offsetX = 32;
    this.offsetY = 32;
    this.navigationHistory = new NavigationHistory();
    /**
     * The workspace
     */
    this._workspace = null;
    /**
     * Incremented for every scroll request so that a slow, stale request (e.g. one waiting for a sprite's
     * workspace to finish loading) can't override a newer one.
     */
    this._scrollToken = 0;
  }

  /**
   * Get the Scratch Editing Target
   * @returns {?Target} the scratch editing target
   */
  getEditingTarget() {
    return this.vm.runtime.getEditingTarget();
  }

  /**
   * Set the current workspace (switches sprites)
   * @param targetID {string}
   */
  setEditingTarget(targetID) {
    if (this.getEditingTarget().id !== targetID) {
      this.vm.setEditingTarget(targetID);
    }
  }

  /**
   * Get the display name of a sprite (or the stage) from its target id
   * @param targetID {string}
   * @returns {string}
   */
  getTargetName(targetID) {
    const target = this.vm.runtime.getTargetById(targetID);
    return target && target.getName ? target.getName() : "";
  }

  /**
   * Resolves after the given number of animation frames. Used to let the editor (React) catch up after
   * switching sprites.
   * @param count {number}
   * @returns {Promise<void>}
   */
  async nextFrames(count = 1) {
    for (let i = 0; i < count; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  /**
   * Returns the main workspace
   * @returns !Blockly.Workspace
   */
  getWorkspace() {
    const currentWorkspace = Blockly.getMainWorkspace();
    if (currentWorkspace.getToolbox()) {
      // Sadly get get workspace does not always return the 'real' workspace... Not sure how to get that at the moment,
      //  but we can work out whether it's the right one by whether it has a toolbox.
      this._workspace = currentWorkspace;
    }
    return this._workspace;
  }

  /**
   * Based on wksp.centerOnBlock(li.data.labelID);
   * @param blockOrId {Blockly.Block|{id}|BlockInstance} A Blockly Block, a block id, or a BlockInstance
   */
  scrollBlockIntoView(blockOrId) {
    const token = ++this._scrollToken;

    if (blockOrId instanceof BlockInstance) {
      // Switch to sprite. This reloads the workspace, which can take a moment, so wait for the block to exist.
      const switching = this.getEditingTarget().id !== blockOrId.targetId;
      this.setEditingTarget(blockOrId.targetId);
      this._whenBlockReady(blockOrId.id, switching, token, (block) => this._scrollToBlock(block));
      return;
    }

    const workspace = this.getWorkspace();
    const block = blockOrId && blockOrId.id ? blockOrId : workspace.getBlockById(blockOrId);
    if (block) {
      this._scrollToBlock(block);
    }
  }

  /**
   * Wait for a block to appear in the main workspace (it won't be there until a sprite switch has finished
   * loading), then call back with it. Gives up after about a second and a half.
   * @private
   */
  _whenBlockReady(id, waitFirstFrame, token, callback) {
    let tries = 0;
    const attempt = () => {
      if (token !== this._scrollToken) {
        return; // A newer request replaced this one
      }
      const workspace = this.getWorkspace();
      const block = workspace && workspace.getBlockById(id);
      if (block) {
        callback(block);
        return;
      }
      if (++tries > 90) {
        return;
      }
      requestAnimationFrame(attempt);
    };
    if (waitFirstFrame) {
      requestAnimationFrame(attempt);
    } else {
      attempt();
    }
  }

  /**
   * Scroll the workspace so that a block is visible, then flash it
   * @param block {Blockly.Block}
   * @private
   */
  _scrollToBlock(block) {
    const workspace = this.getWorkspace();

    /**
     * !Blockly.Block
     */
    let root = block.getRootBlock();
    let base = this.getTopOfStackFor(block);
    let ePos = base.getRelativeToSurfaceXY(), // Align with the top of the block
      rPos = root.getRelativeToSurfaceXY(), // Align with the left of the block 'stack'
      scale = workspace.scale,
      x = rPos.x * scale,
      y = ePos.y * scale,
      xx = block.width + x, // Turns out they have their x & y stored locally, and they are the actual size rather than scaled or including children...
      yy = block.height + y,
      s = workspace.getMetrics();
    if (
      x < s.viewLeft + this.offsetX - 4 ||
      xx > s.viewLeft + s.viewWidth ||
      y < s.viewTop + this.offsetY - 4 ||
      yy > s.viewTop + s.viewHeight
    ) {
      // sx = s.contentLeft + s.viewWidth / 2 - x,
      let sx = x - s.contentLeft - this.offsetX,
        // sy = s.contentTop - y + Math.max(Math.min(32, 32 * scale), (s.viewHeight - yh) / 2);
        sy = y - s.contentTop - this.offsetY;

      this.navigationHistory.storeView(this.navigationHistory.peek(), 64);

      // workspace.hideChaff(),
      workspace.scrollbar.set(sx, sy);
      this.navigationHistory.storeView({ left: sx, top: sy }, 64);
    }
    this.blockly?.hideChaff();
    BlockFlasher.flash(block);
  }

  /**
   * Find the top stack block of a  stack
   * @param block a block in a stack
   * @returns {*} a block that is the top of the stack of blocks
   */
  getTopOfStackFor(block) {
    let base = block;
    while (base.getOutputShape() && base.getSurroundParent()) {
      base = base.getSurroundParent();
    }
    return base;
  }
}

class NavigationHistory {
  /**
   * Keep a record of the scroll and zoom position
   */
  storeView(next, dist) {
    forward = [];
    let workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let pos = { left: s.viewLeft, top: s.viewTop };
    if (!next || distance(pos, next) > dist) {
      views.push(pos);
    }
  }

  peek() {
    return views.length > 0 ? views[views.length - 1] : null;
  }

  goBack() {
    const workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let pos = { left: s.viewLeft, top: s.viewTop };
    let view = this.peek();
    if (!view) {
      return;
    }
    if (distance(pos, view) < 64) {
      // Go back to current if we are already far away from it
      if (views.length > 1) {
        views.pop();
        forward.push(view);
      }
    }

    view = this.peek();
    if (!view) {
      return;
    }

    let sx = view.left - s.contentLeft,
      sy = view.top - s.contentTop;

    // transform.setTranslate(-600,0);

    workspace.scrollbar.set(sx, sy);

    /*
              let blocklySvg = document.getElementsByClassName('blocklySvg')[0];
              let blocklyBlockCanvas = blocklySvg.getElementsByClassName('blocklyBlockCanvas')[0];
              let transform = blocklyBlockCanvas.transform.baseVal.getItem(0);
              let scale = blocklyBlockCanvas.transform.baseVal.getItem(1);

              let transformMatrix = transform.matrix;
              let scaleMatrix = scale.matrix;

              console.log('Transform - getMetrics', s);
              console.log('sx, sy: ', sx, sy);
              console.log('left, top: ', view.left, view.top);
              console.log('contentLeft, right:', s.contentLeft, s.contentTop);
              console.log('transform, scale matrix: ', transformMatrix, scaleMatrix);
  */
  }

  goForward() {
    let view = forward.pop();
    if (!view) {
      return;
    }
    views.push(view);

    let workspace = Blockly.getMainWorkspace(),
      s = workspace.getMetrics();

    let sx = view.left - s.contentLeft,
      sy = view.top - s.contentTop;

    workspace.scrollbar.set(sx, sy);
  }
}

function distance(pos, next) {
  return Math.sqrt(Math.pow(pos.left - next.left, 2) + Math.pow(pos.top - next.top, 2));
}