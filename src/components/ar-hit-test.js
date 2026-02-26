

/**
 * AR Hit Test Component
 * Handles the cursor placement on flat surfaces using WebXR hit testing.
 * Used instead of manual raycasting in xrLoop.
 */
AFRAME.registerComponent('ar-hit-test', {
    init: function () {
        this.xrSession = null;
        this.xrRefSpace = null;
        this.hitTestSource = null;

        const sceneEl = this.el.sceneEl;
        this.cursorEl = document.getElementById('cursor');

        // Listen for AR session start
        sceneEl.addEventListener('enter-vr', () => {
            if (sceneEl.is('ar-mode')) {
                this.setupHitTest();
            }
        });
    },

    setupHitTest: async function () {
        const sceneEl = this.el.sceneEl;
        this.xrSession = sceneEl.renderer.xr.getSession();

        if (this.xrSession) {
            try {
                this.xrRefSpace = sceneEl.renderer.xr.getReferenceSpace();
                const viewer = await this.xrSession.requestReferenceSpace('viewer');
                this.hitTestSource = await this.xrSession.requestHitTestSource({ space: viewer });
                console.log('✅ AR Hit-Test initialized!');
            } catch (e) {
                console.warn('❌ AR Hit-Test error:', e);
            }
        }
    },

    tick: function (time, timeDelta) {
        if (!this.hitTestSource || !this.xrSession) return;

        const frame = this.el.sceneEl.frame;
        if (!frame || !this.xrRefSpace) return;

        try {
            const hits = frame.getHitTestResults(this.hitTestSource);
            if (hits.length > 0) {
                const pose = hits[0].getPose(this.xrRefSpace);
                if (pose) {
                    const p = pose.transform.position;
                    const r = pose.transform.orientation;

                    if (this.cursorEl) {
                        this.cursorEl.object3D.visible = true;
                        this.cursorEl.object3D.position.set(p.x, p.y, p.z);

                        if (r) {
                            const poseRot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
                            const offset = new THREE.Quaternion();
                            offset.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // -90 deg X
                            poseRot.multiply(offset);
                            this.cursorEl.object3D.quaternion.copy(poseRot);
                        } else {
                            this.cursorEl.object3D.rotation.set(-Math.PI / 2, 0, 0);
                        }
                    }

                    // Inform main.js of new surface points (for Legacy Code in main.js)
                    if (typeof window.addSurface === 'function') {
                        window.addSurface(p.x, p.y, p.z);
                    }
                }
            } else {
                if (this.cursorEl) this.cursorEl.object3D.visible = false;
            }
        } catch (e) {
            console.error("Hit test error (tick):", e);
        }
    }
});
