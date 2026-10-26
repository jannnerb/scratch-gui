/**
 * Turns global variables that only ONE sprite ever writes into that sprite's local variable.
 * Reads from other sprites become `[variable] of [Sprite]`.
 * Skipped (left global): written by 0 or 2+ targets, written only by the stage, cloud variables,
 * owner sprite is cloned, show/hide used outside the owner, name conflicts, unresolvable references.
 */

const WRITE_OPCODES = ['data_setvariableto', 'data_changevariableby'];
const SHOWHIDE_OPCODES = ['data_showvariable', 'data_hidevariable'];

const newId = () => `cv${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const consolidateVariables = vm => {
    const runtime = vm.runtime;
    const stage = runtime.getTargetForStage();
    const targets = runtime.targets.filter(t => t.isOriginal);
    const spriteTargets = targets.filter(t => !t.isStage);

    // Candidates: global, non-cloud, scalar variables
    const info = new Map();
    const idByName = new Map();
    for (const id of Object.keys(stage.variables)) {
        const v = stage.variables[id];
        if (v.type !== '' || v.isCloud) continue;
        info.set(id, {
            variable: v,
            writers: new Set(),
            reads: [],
            showHideTargets: new Set(),
            stageObjectMenus: [],
            reason: null
        });
        idByName.set(v.name, id);
    }

    // Sprites that get cloned (a clone would get its OWN local copy, changing behavior)
    const clonedSprites = new Set();
    let unknownCloneTarget = false;
    for (const t of targets) {
        const blocks = t.blocks._blocks;
        for (const blockId of Object.keys(blocks)) {
            const b = blocks[blockId];
            if (b.opcode === 'control_create_clone_of') {
                const input = b.inputs.CLONE_OPTION;
                if (!input || input.block !== input.shadow) unknownCloneTarget = true;
            } else if (b.opcode === 'control_create_clone_of_menu') {
                const value = b.fields.CLONE_OPTION.value;
                clonedSprites.add(value === '_myself_' ? t.sprite.name : value);
            }
        }
    }

    // Scan every block of every target
    for (const t of targets) {
        const blocks = t.blocks._blocks;
        for (const blockId of Object.keys(blocks)) {
            const b = blocks[blockId];
            const varField = b.fields && b.fields.VARIABLE;
            if (varField && info.has(varField.id)) {
                const entry = info.get(varField.id);
                if (WRITE_OPCODES.includes(b.opcode)) {
                    entry.writers.add(t);
                } else if (b.opcode === 'data_variable') {
                    entry.reads.push({target: t, block: b});
                } else if (SHOWHIDE_OPCODES.includes(b.opcode)) {
                    entry.showHideTargets.add(t);
                } else {
                    entry.reason = `used by unsupported block (${b.opcode})`;
                }
            } else if (b.opcode === 'sensing_of' && b.fields.PROPERTY && idByName.has(b.fields.PROPERTY.value)) {
                // "[var] of [Stage]" reads a global variable by name
                const entry = info.get(idByName.get(b.fields.PROPERTY.value));
                const input = b.inputs.OBJECT;
                const menu = input && input.block === input.shadow ? blocks[input.block] : null;
                if (!menu) {
                    entry.reason = 'read through a dynamic "of" block';
                } else if (menu.fields.OBJECT.value === '_stage_') {
                    entry.stageObjectMenus.push(menu);
                }
            }
        }
    }

    const converted = [];
    const skipped = [];
    const touchedTargets = new Set();

    for (const [id, entry] of info) {
        const v = entry.variable;
        if (entry.writers.size === 0) continue; // never written: leave alone, not "edited by one sprite"
        let owner = null;
        let reason = entry.reason;
        if (!reason) {
            if (entry.writers.size > 1) {
                reason = 'edited by multiple targets';
            } else {
                owner = Array.from(entry.writers)[0];
                if (owner.isStage) reason = 'only edited by the stage';
                else if (unknownCloneTarget || clonedSprites.has(owner.sprite.name)) reason = 'owner sprite is cloned';
                else if (Array.from(entry.showHideTargets).some(t => t !== owner)) reason = 'show/hide variable used in another target';
                else if (Object.keys(owner.variables).some(k => owner.variables[k].name === v.name && k !== id)) reason = 'owner already has a local variable with this name';
            }
        }
        if (reason) {
            skipped.push({name: v.name, reason});
            continue;
        }

        // Move the variable (same id, so the owner's blocks keep working untouched)
        delete stage.variables[id];
        owner.variables[id] = v;

        // Reads elsewhere become "[name] of [Owner]"
        const ownerName = owner.sprite.name;
        for (const {target, block} of entry.reads) {
            if (target === owner) continue;
            const menuId = newId();
            block.opcode = 'sensing_of';
            block.fields = {PROPERTY: {name: 'PROPERTY', value: v.name}};
            block.inputs = {OBJECT: {name: 'OBJECT', block: menuId, shadow: menuId}};
            target.blocks._blocks[menuId] = {
                id: menuId,
                opcode: 'sensing_of_object_menu',
                inputs: {},
                fields: {OBJECT: {name: 'OBJECT', value: ownerName}},
                next: null,
                topLevel: false,
                parent: block.id,
                shadow: true
            };
            touchedTargets.add(target);
        }
        for (const menu of entry.stageObjectMenus) {
            menu.fields.OBJECT.value = ownerName;
        }

        // Keep its stage monitor (if any) attached to the new owner
        try {
            runtime.requestUpdateMonitor({id, spriteName: ownerName, targetId: owner.id});
        } catch (e) {
            console.warn('could not update monitor for', v.name, e);
        }

        converted.push({name: v.name, sprite: ownerName});
    }

    for (const t of targets) t.blocks.resetCache();
    if (converted.length > 0) {
        vm.emitWorkspaceUpdate();
        runtime.emitProjectChanged();
    }
    return {converted, skipped};
};

export default consolidateVariables;
