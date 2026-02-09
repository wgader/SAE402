/* global AFRAME */

/**
 * Forces the WebGL renderer to be transparent.
 * Sometimes A-Frame or Three.js defaults override HTML transparency.
 * This ensures the camera feed (Pass-through) is visible.
 */
AFRAME.registerComponent('force-transparent', {
    init: function () {
        this.updateTransparency = this.updateTransparency.bind(this);
        this.el.sceneEl.addEventListener('enter-vr', this.updateTransparency);
        this.el.sceneEl.addEventListener('render-target-loaded', this.updateTransparency);
    },

    updateTransparency: function () {
        const scene = this.el.sceneEl;
        if (scene.renderer) {
            scene.renderer.setClearColor(0x000000, 0); // Black, 0 Alpha
            scene.renderer.alpha = true;
            console.log('Force Transparent: Transparency enforced on renderer.');
        }
    }
});
