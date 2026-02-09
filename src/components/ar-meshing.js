/* global AFRAME, THREE */

/**
 * Handles WebXR Real World Meshing.
 * Detects the room environment (walls, tables, furniture) 
 * and creates corresponding 3D meshes for visualization and physics.
 */
AFRAME.registerComponent('ar-meshing', {
    schema: {
        enabled: { type: 'boolean', default: true },
        visualize: { type: 'boolean', default: true }, // Show wireframe?
        color: { type: 'color', default: '#00FF00' }
    },

    init: function () {
        this.meshes = new Map();
        this.onMeshAdded = this.onMeshAdded.bind(this);
        this.onMeshRemoved = this.onMeshRemoved.bind(this);

        // WebXR Session events
        this.el.sceneEl.addEventListener('enter-vr', () => {
            const session = this.el.sceneEl.renderer.xr.getSession();
            if (session) {
                console.log('Meshing capability:', session.enabledFeatures.includes('mesh-detection'));
            }
        });
    },

    tick: function () {
        const session = this.el.sceneEl.renderer.xr.getSession();
        if (!session || !this.data.enabled) return;

        // Check if detectedMeshes is available (WebXR Mesh Detection Module)
        // Note: Browser support varies. 
        if (session.detectedMeshes) {
            // Handle removals
            this.meshes.forEach((meshEl, xrMesh) => {
                if (!session.detectedMeshes.has(xrMesh)) {
                    this.onMeshRemoved(xrMesh);
                }
            });

            // Handle Additions/Updates
            session.detectedMeshes.forEach(xrMesh => {
                if (!this.meshes.has(xrMesh)) {
                    this.onMeshAdded(xrMesh);
                } else {
                    // Update if needed (usually automatic if sharing buffer, but frame-of-ref might change)
                    this.updateMesh(xrMesh);
                }
            });
        }
    },

    onMeshAdded: function (xrMesh) {
        console.log('New Mesh Detected', xrMesh);

        const el = document.createElement('a-entity');
        const geometry = new THREE.BufferGeometry();
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
                color: this.data.color,
                wireframe: this.data.visualize,
                opacity: 0.5,
                transparent: true
            })
        );

        el.setObject3D('mesh', mesh);

        // Important: Update geometry from xrMesh
        this.updateGeometry(geometry, xrMesh);

        // Add physics (Static Body)
        // We use a simplified box or the complex mesh? 
        // Complex mesh collision is expensive. For enabled "mesh-detection", usually we want precise interaction.
        // 'mesh' shape in cannon.js is optional.
        el.setAttribute('static-body', 'shape: mesh');

        this.el.sceneEl.appendChild(el);
        this.meshes.set(xrMesh, el);
    },

    onMeshRemoved: function (xrMesh) {
        const el = this.meshes.get(xrMesh);
        if (el) {
            el.parentNode.removeChild(el);
            this.meshes.delete(xrMesh);
        }
    },

    updateMesh: function (xrMesh) {
        const el = this.meshes.get(xrMesh);
        if (!el) return;

        const mesh = el.getObject3D('mesh');
        // Update pose
        const frame = this.el.sceneEl.renderer.xr.getFrame();
        if (!frame) return;

        const pose = frame.getPose(xrMesh.meshSpace, this.el.sceneEl.renderer.xr.getReferenceSpace());
        if (pose) {
            el.object3D.position.copy(pose.transform.position);
            el.object3D.quaternion.copy(pose.transform.orientation);
        }

        // Update geometry vertices if changed (timestamp check usually needed)
        if (xrMesh.lastChangedTime > this.lastTime) {
            this.updateGeometry(mesh.geometry, xrMesh);
        }
    },

    updateGeometry: function (geometry, xrMesh) {
        // Create/Update BufferAttributes from xrMesh.vertices / xrMesh.indices
        // This part depends on the browser's implementation of valid WebXR Mesh attribute access
        // Standard: xrMesh.vertices (Float32Array) and xrMesh.indices (Uint32Array)

        if (!xrMesh.vertices || !xrMesh.indices) return;

        geometry.setAttribute('position', new THREE.BufferAttribute(xrMesh.vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(xrMesh.indices, 1));

        geometry.attributes.position.needsUpdate = true;
        geometry.index.needsUpdate = true;
        geometry.computeBoundingSphere();
    }
});
