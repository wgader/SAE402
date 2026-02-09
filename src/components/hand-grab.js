/* global AFRAME, THREE */

/* 
 * Composant : controller-grab
 * Description : Permet d'attraper des objets avec les manettes Quest (grip button)
 * NOTE: N'utilise QUE le grip, le trigger est réservé pour placer les tasses
 */

AFRAME.registerComponent('controller-grab', {
    schema: {
        hand: { type: 'string', default: 'right' }
    },

    init: function () {
        this.grabbedEl = null;
        this.grabOffset = new THREE.Vector3();
        this.grabDistance = 0.15; // Distance de grab en mètres

        // Écouter UNIQUEMENT le bouton grip de la manette
        // Le trigger est réservé pour cup-spawner (poser la tasse)
        this.el.addEventListener('gripdown', this.onGripDown.bind(this));
        this.el.addEventListener('gripup', this.onGripUp.bind(this));

        console.log(`🎮 Controller-grab initialisé pour la main ${this.data.hand}`);
    },

    tick: function () {
        // Si on tient un objet, le déplacer avec la manette
        if (this.grabbedEl) {
            const controllerPos = new THREE.Vector3();
            this.el.object3D.getWorldPosition(controllerPos);

            const controllerQuat = new THREE.Quaternion();
            this.el.object3D.getWorldQuaternion(controllerQuat);

            // Appliquer la position et rotation au mesh Three.js
            this.grabbedEl.object3D.position.copy(controllerPos);
            this.grabbedEl.object3D.quaternion.copy(controllerQuat);

            // IMPORTANT: Synchroniser aussi avec le body CANNON.js
            if (this.grabbedEl.body) {
                this.grabbedEl.body.position.set(controllerPos.x, controllerPos.y, controllerPos.z);
                this.grabbedEl.body.quaternion.set(controllerQuat.x, controllerQuat.y, controllerQuat.z, controllerQuat.w);
                this.grabbedEl.body.velocity.set(0, 0, 0);
                this.grabbedEl.body.angularVelocity.set(0, 0, 0);
            }
        }
    },

    onGripDown: function (evt) {
        if (this.grabbedEl) return;

        const controllerPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(controllerPos);

        // Chercher l'objet grabbable le plus proche
        const grabbables = document.querySelectorAll('[grabbable]');
        let closestEl = null;
        let closestDist = this.grabDistance;

        grabbables.forEach((el) => {
            const objPos = new THREE.Vector3();
            el.object3D.getWorldPosition(objPos);

            const dist = controllerPos.distanceTo(objPos);
            if (dist < closestDist) {
                closestDist = dist;
                closestEl = el;
            }
        });

        if (closestEl) {
            this.grabbedEl = closestEl;
            closestEl.emit('grab-start', { hand: this.data.hand });
            console.log(`✊ Objet attrapé avec manette: ${closestEl.id || 'sans id'}`);
        }
    },

    onGripUp: function (evt) {
        if (this.grabbedEl) {
            this.grabbedEl.emit('grab-end', { hand: this.data.hand });
            console.log(`🖐️ Objet relâché`);
            this.grabbedEl = null;
        }
    }
});

/* 
 * Composant : hand-grab
 * Description : Permet d'attraper des objets avec les mains en XR (Quest 3)
 */

AFRAME.registerComponent('hand-grab', {
    schema: {
        hand: { type: 'string', default: 'right' } // 'left' ou 'right'
    },

    init: function () {
        this.grabbedEl = null;
        this.grabOffset = new THREE.Vector3();

        // Créer une sphère invisible pour détecter les collisions
        this.grabSphere = new THREE.Sphere(new THREE.Vector3(), 0.08); // 8cm de rayon

        // Écouter les événements de pinch (pouce + index)
        this.el.addEventListener('pinchstarted', this.onPinchStart.bind(this));
        this.el.addEventListener('pinchended', this.onPinchEnd.bind(this));

        console.log(`🖐️ Hand-grab initialisé pour la main ${this.data.hand}`);
    },

    tick: function () {
        // Mettre à jour la position de la sphère de grab
        const handPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(handPos);
        this.grabSphere.center.copy(handPos);

        // Si on tient un objet, le déplacer avec la main
        if (this.grabbedEl) {
            this.grabbedEl.object3D.position.copy(handPos);

            // IMPORTANT: Synchroniser aussi avec le body CANNON.js
            if (this.grabbedEl.body) {
                this.grabbedEl.body.position.set(handPos.x, handPos.y, handPos.z);
                this.grabbedEl.body.velocity.set(0, 0, 0);
                this.grabbedEl.body.angularVelocity.set(0, 0, 0);
            }
        }
    },

    onPinchStart: function (evt) {
        if (this.grabbedEl) return; // Déjà en train de tenir quelque chose

        // Chercher tous les objets attrapables
        const grabbables = document.querySelectorAll('[grabbable]');

        grabbables.forEach((el) => {
            if (this.grabbedEl) return; // Déjà trouvé

            const objPos = new THREE.Vector3();
            el.object3D.getWorldPosition(objPos);

            // Vérifier si l'objet est dans la sphère de grab
            if (this.grabSphere.containsPoint(objPos)) {
                this.grabbedEl = el;

                // Émettre un événement sur l'objet
                el.emit('grab-start', { hand: this.data.hand });

                console.log(`✊ Objet attrapé: ${el.id || 'sans id'}`);
            }
        });
    },

    onPinchEnd: function (evt) {
        if (this.grabbedEl) {
            // Émettre un événement sur l'objet
            this.grabbedEl.emit('grab-end', { hand: this.data.hand });

            console.log(`🖐️ Objet relâché: ${this.grabbedEl.id || 'sans id'}`);
            this.grabbedEl = null;
        }
    }
});

/* 
 * Composant : grabbable
 * Description : Marque un objet comme attrapable avec support de la physique
 */
AFRAME.registerComponent('grabbable', {
    init: function () {
        // Sauvegarder la couleur originale
        this.originalColor = null;

        // Pour calculer la vélocité de lancer (moyenne lissée)
        this.previousPositions = [];
        this.maxPositionHistory = 5; // Garder les 5 dernières positions
        this.velocity = new THREE.Vector3();
        this.isGrabbed = false;
        this.originalBodyType = null;

        // Attendre que le body physique soit prêt
        this.el.addEventListener('body-loaded', () => {
            console.log('🎯 Body physique chargé pour:', this.el.id || 'objet');
        });

        // Feedback visuel quand on attrape l'objet
        this.el.addEventListener('grab-start', () => {
            this.isGrabbed = true;
            this.previousPositions = []; // Reset l'historique

            const mat = this.el.getAttribute('material');
            if (mat) {
                this.originalColor = mat.color || '#4CC3D9';
            }
            this.el.setAttribute('material', 'color', '#FFD700'); // Doré quand attrapé
            this.el.setAttribute('material', 'emissive', '#FF8C00');

            // Désactiver la physique pendant le grab
            if (this.el.body) {
                this.originalBodyType = this.el.body.type;
                // KINEMATIC = 2, mais on préfère juste mettre mass à 0 et figer
                this.el.body.mass = 0;
                this.el.body.updateMassProperties();
                this.el.body.velocity.set(0, 0, 0);
                this.el.body.angularVelocity.set(0, 0, 0);
                // Mettre en mode "sleep" pour éviter les calculs
                this.el.body.type = 2; // KINEMATIC
                console.log('✊ Physique désactivée pour grab');
            }
        });

        this.el.addEventListener('grab-end', () => {
            // Calculer la vélocité finale avant de désactiver le grab
            const finalVelocity = this.calculateAverageVelocity();

            this.isGrabbed = false;

            if (this.originalColor) {
                this.el.setAttribute('material', 'color', this.originalColor);
            }
            this.el.setAttribute('material', 'emissive', '#000000');

            // Réactiver la physique et appliquer la vélocité de lancer
            if (this.el.body) {
                // Remettre en DYNAMIC
                this.el.body.type = 1; // DYNAMIC
                this.el.body.mass = 1;
                this.el.body.updateMassProperties();

                // IMPORTANT: Réveiller le body
                this.el.body.wakeUp();

                // Appliquer la vélocité
                const throwMultiplier = 3; // Ajusté pour être plus réaliste
                const vx = finalVelocity.x * throwMultiplier;
                const vy = finalVelocity.y * throwMultiplier;
                const vz = finalVelocity.z * throwMultiplier;

                this.el.body.velocity.set(vx, vy, vz);

                // Ajouter un peu de rotation pour le réalisme
                this.el.body.angularVelocity.set(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2
                );

                console.log(`🚀 Lancé! Vélocité: (${vx.toFixed(2)}, ${vy.toFixed(2)}, ${vz.toFixed(2)})`);
            }
        });
    },

    calculateAverageVelocity: function () {
        if (this.previousPositions.length < 2) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Calculer la vélocité moyenne des dernières positions
        const avgVelocity = new THREE.Vector3();

        for (let i = 1; i < this.previousPositions.length; i++) {
            const prev = this.previousPositions[i - 1];
            const curr = this.previousPositions[i];

            const dt = (curr.time - prev.time) / 1000; // Convertir en secondes
            if (dt > 0) {
                avgVelocity.x += (curr.pos.x - prev.pos.x) / dt;
                avgVelocity.y += (curr.pos.y - prev.pos.y) / dt;
                avgVelocity.z += (curr.pos.z - prev.pos.z) / dt;
            }
        }

        const count = this.previousPositions.length - 1;
        avgVelocity.divideScalar(count);

        return avgVelocity;
    },

    tick: function (time, delta) {
        // Enregistrer les positions pendant le grab pour calculer la vélocité
        if (this.isGrabbed && delta > 0) {
            const currentPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(currentPosition);

            // Ajouter à l'historique
            this.previousPositions.push({
                pos: currentPosition.clone(),
                time: time
            });

            // Garder seulement les N dernières positions
            if (this.previousPositions.length > this.maxPositionHistory) {
                this.previousPositions.shift();
            }
        }
    }
});
