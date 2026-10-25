// Wipes all loaded extensions from the VM so a newly loaded project starts with none.
// Uses private VM fields (_loadedExtensions, workerURLs, _blockInfo), so it may break if scratch-vm changes.

const ADDON_BLOCKS_CATEGORY_ID = 'a-b'; // TurboWarp addon blocks; not a real extension, keep it

const wipeExtensions = vm => {
    const extensionManager = vm.extensionManager;
    const runtime = vm.runtime;

    // Forget which extensions/URLs are loaded so the next project reloads its own fresh.
    // Without clearing workerURLs, custom extensions would be treated as "already loaded" and never re-register.
    extensionManager._loadedExtensions.clear();
    extensionManager.workerURLs = [];

    // Remove extension categories from the toolbox.
    runtime._blockInfo = runtime._blockInfo.filter(category => category.id === ADDON_BLOCKS_CATEGORY_ID);
};

/**
 * vm.deserializeProject() calls vm.clear() after the project file validates but before its
 * extensions load, so wrapping clear() wipes at exactly the right time.
 */
const installExtensionWipe = vm => {
    if (vm._twWipeExtensionsInstalled) return;
    vm._twWipeExtensionsInstalled = true;
    const originalClear = vm.clear;
    vm.clear = function (...args) {
        wipeExtensions(this);
        return originalClear.apply(this, args);
    };
};

export default installExtensionWipe;
