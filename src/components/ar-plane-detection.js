/* global AFRAME, THREE */

/**
 * AR Plane Detection - Détecte les surfaces réelles et crée des colliders
 */
AFRAME.registerComponent('ar-plane-detection', {
    schema: {
        visualize: { type: 'boolean', default: true }
    },

    init: function () {
        this.planes = new Map();
        this.xrSession = null;
        this.referenceSpace = null;

        this.el.sceneEl.addEventListener('enter-vr', () => {
            setTimeout(() => {
                const renderer = this.el.sceneEl.renderer;
                if (renderer && renderer.xr) {
                    this.xrSession = renderer.xr.getSession();
                    this.referenceSpace = renderer.xr.getReferenceSpace();
                    if (this.xrSession) {
                        console.log('[Planes] Session active, plane-detection:',
                            this.xrSession.enabledFeatures?.includes('plane-detection'));
                    }
                }
            }, 500);
        });
    },

    tick: function () {
        if (!this.xrSession) return;

        const frame = this.el.sceneEl.renderer.xr.getFrame();
        if (!frame) return;

        // Essayer d'accéder aux plans détectés
        const detectedPlanes = frame.detectedPlanes || this.xrSession.detectedPlanes;
        if (!detectedPlanes) return;

        // Mettre à jour les plans
        detectedPlanes.forEach(plane => {
            const id = this.getPlaneId(plane);

            if (!this.planes.has(id)) {
                this.createPlane(plane, id, frame);
            } else {
                this.updatePlane(plane, id, frame);
            }
        });

        // Supprimer les plans disparus
        this.planes.forEach((entity, id) => {
            let found = false;
            detectedPlanes.forEach(p => {
                if (this.getPlaneId(p) === id) found = true;
            });
            if (!found) {
                entity.parentNode?.removeChild(entity);
                this.planes.delete(id);
            }
        });
    },

    getPlaneId: function (plane) {
        return plane.planeSpace?.toString() || `plane_${Math.random()}`;
    },

    createPlane: function (plane, id, frame) {
        const entity = document.createElement('a-entity');

        // Calculer taille
        let width = 1, depth = 1;
        if (plane.polygon && plane.polygon.length > 0) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const p of plane.polygon) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minZ = Math.min(minZ, p.z);
                maxZ = Math.max(maxZ, p.z);
            }
            width = Math.max(0.1, maxX - minX);
            depth = Math.max(0.1, maxZ - minZ);
        }


        // Géométrie box fine
        entity.setAttribute('geometry', {
            primitive: 'box',
            width: width,
            height: 0.02,
            depth: depth
        });

        // Couleur selon orientation
        const isHorizontal = plane.orientation === 'horizontal';
        if (this.data.visualize) {
            entity.setAttribute('material', {
                color: isHorizontal ? '#00AAFF' : '#FF6600',
                opacity: 0.4,
                transparent: true
            });
        } else {
            entity.setAttribute('visible', 'false');
        }

        // PHYSIQUE
        entity.setAttribute('static-body', '');

        this.el.sceneEl.appendChild(entity);
        this.planes.set(id, entity);

        // Positionner
        this.updatePlane(plane, id, frame);

        console.log('[Planes] Nouveau plan:', plane.orientation, 'taille:', width.toFixed(2), 'x', depth.toFixed(2));
    },

    updatePlane: function (plane, id, frame) {
        const entity = this.planes.get(id);
        if (!entity || !plane.planeSpace || !this.referenceSpace) return;

        try {
            const pose = frame.getPose(plane.planeSpace, this.referenceSpace);
            if (pose) {
                const { position, orientation } = pose.transform;
                entity.object3D.position.set(position.x, position.y, position.z);
                entity.object3D.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);

                // Sync physics body
                if (entity.body) {
                    entity.body.position.set(position.x, position.y, position.z);
                    entity.body.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
                }
            }
        } catch (e) {
            // Ignore pose errors
        }
    }
});
