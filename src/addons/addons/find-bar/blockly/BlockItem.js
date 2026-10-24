export default class BlockItem {
  constructor(cls, procCode, labelID, y) {
    this.cls = cls;
    this.procCode = procCode;
    this.labelID = labelID;
    this.y = y;
    this.lower = procCode.toLowerCase();
    /**
     * An Array of block ids
     * @type {Array.<string>}
     */
    this.clones = null;
    this.eventName = null;

    // Used by the "whole project" search scope:
    /**
     * Every matching block across all sprites (BlockInstance objects), or null when this item
     * is resolved in some other way (sprite scope, broadcasts, costumes, sounds).
     * @type {?Array.<import("./BlockInstance.js").default>}
     */
    this.instances = null;
    /**
     * Any block or variable ids that should count as "this item" (used by middle-click jumping).
     * @type {?Set.<string>}
     */
    this.matchIds = null;
    /**
     * Names of the sprites this item lives in, shown as a muted suffix in the dropdown.
     * @type {?Set.<string>}
     */
    this.targetNames = null;
    /** @type {string} */
    this.suffix = "";
    /**
     * For costumes and sounds in project scope: which sprite owns the asset.
     * @type {?string}
     */
    this.targetId = null;
  }

  /**
   * True if the blockID matches a black represented by this BlockItem
   * @param id
   * @returns {boolean}
   */
  matchesID(id) {
    if (this.labelID === id) {
      return true;
    }
    if (this.matchIds && this.matchIds.has(id)) {
      return true;
    }
    if (this.clones) {
      for (const cloneID of this.clones) {
        if (cloneID === id) {
          return true;
        }
      }
    }
    return false;
  }
}