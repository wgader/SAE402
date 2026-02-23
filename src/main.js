import 'aframe';
import 'aframe-extras';
import 'aframe-physics-system';


console.log('☕ SAE 402 - Chargement...');

window.addEventListener('load', () => {
    setTimeout(() => {
        const debugEl = document.getElementById('debug');
        const surfacesEl = document.getElementById('surfaces');
        const startBtn = document.getElementById('start-btn');
        const landingPage = document.getElementById('landing-page');
        const gameContainer = document.getElementById('game-container');
        const sceneEl = document.getElementById('scene');
        const cubeEl = document.getElementById('cube');
        let cursorEl = document.getElementById('cursor');

        // Hide scene initially
        if (sceneEl) {
            sceneEl.style.display = 'none';
        }

        if (!sceneEl) {
            if (debugEl) debugEl.textContent = 'Scène manquante!';
            console.error('Scène manquante!');
            return;
        }

        // AUTO-CREATE CURSOR IF MISSING
        if (!cursorEl && sceneEl) {
            console.log('Creating cursor manually...');
            cursorEl = document.createElement('a-ring');
            cursorEl.id = 'cursor';
            cursorEl.setAttribute('color', 'green');
            cursorEl.setAttribute('radius-inner', '0.05'); // Slightly thicker
            cursorEl.setAttribute('radius-outer', '0.08');
            cursorEl.setAttribute('rotation', '-90 0 0');
            cursorEl.setAttribute('visible', 'false');
            cursorEl.setAttribute('material', 'shader: flat; opacity: 0.8; transparent: true');
            sceneEl.appendChild(cursorEl);
        }

        if (debugEl) debugEl.textContent = 'Prêt!';

        // ENSURE CURSOR EXISTS (Robustness Fix)
        if (!cursorEl) {
            console.warn('⚠️ Cursor missing in HTML, creating it manually.');
            const c = document.createElement('a-ring');
            c.id = 'cursor';
            c.setAttribute('color', 'green');
            c.setAttribute('radius-inner', '0.02');
            c.setAttribute('radius-outer', '0.04');
            c.setAttribute('rotation', '-90 0 0'); // Flat on ground
            c.setAttribute('visible', 'false');
            sceneEl.appendChild(c);
            // Update reference
            // cursorEl is const, so we can't reassign it easily if it was null. 
            // We need to handle this.
            // But standard 'const cursorEl' at top of scope would be null.
        }
        // Actually, since cursorEl is const in line 16, we can't reassign.
        // We must rely on 'document.getElementById' returning the new one or use a mutable var.
        // Let's change the variable declaration to let, OR just re-fetch it.

        let xrSession = null;
        let xrRefSpace = null;
        let hitTestSource = null;

        // Grab state
        let grabbed = false;
        let grabController = null;
        let velocities = [];
        const surfaces = [];
        const spawnedObjects = [];
        let currentGrabbedEl = null; // Track which element is grabbed

        let menuToggleLock = false; // Prevents flickering when holding button
        let coffeeMachineLock = false; // Prevents multiple coffee spawns
        let coffeeAudio = null; // Audio element for coffee sound

        // --- TUTORIAL STATE ---
        let tutorialStep = 0;
        let tutorialUI = null;
        let tutorialText = null;
        let activeStains = 0;
        var deliveryDebugLock = false;

        // --- GAME MODE STATE ---
        var gameMode = false;
        var customerQueue = [];  // All customers in the queue
        var activeCustomer = null;  // Current customer being served
        var coffeesOrdered = 0;  // How many coffees current customer wants
        var coffeesDelivered = 0;  // How many delivered so far
        var billCollected = false;  // Has the bill been collected
        var totalServed = 0;  // Total customers served
        var totalEarnings = 0;  // Total money earned
        const SERVICE_POS = { x: 0, z: -1.5 };  // Where customer stands to be served
        const QUEUE_SPACING = 1.2;  // Space between customers in queue
        const QUEUE_START_Z = -4.0;  // Where queue starts (behind service pos)

        function updateTutorialUI() {
            if (!tutorialText) return;

            // GAME MODE: show current order
            if (gameMode) {
                let msg = 'CAFE OPEN!\n';
                msg += 'Served: ' + totalServed + ' | $' + totalEarnings + '\n\n';
                if (activeCustomer) {
                    msg += 'ORDER: ' + coffeesOrdered + ' coffee' + (coffeesOrdered > 1 ? 's' : '') + '\n';
                    for (var i = 0; i < coffeesOrdered; i++) {
                        if (i < coffeesDelivered) msg += '[x] Coffee ' + (i + 1) + '\n';
                        else if (i === coffeesDelivered) msg += '> Make coffee ' + (i + 1) + '\n';
                        else msg += '[  ] Coffee ' + (i + 1) + '\n';
                    }
                    if (coffeesDelivered >= coffeesOrdered && !billCollected) {
                        msg += '\n> Collect bill -> Register\n';
                    } else if (billCollected) {
                        msg += '\n[x] Payment done!\n';
                    }
                } else {
                    msg += 'Waiting for customer...\n';
                }
                msg += '\nQueue: ' + customerQueue.length + ' waiting';
                tutorialText.setAttribute('value', msg);
                return;
            }

            // TUTORIAL MODE
            let msg = "TO DO:\n\n";

            if (tutorialStep === 1) msg += "> Buy Broom & Dustpan (Menu Y)\n  Then clean the floor!\n";
            else if (tutorialStep > 1) msg += "[x] Floor cleaned\n";

            if (tutorialStep === 2) msg += "> Throw Dustpan in the Trash\n";
            else if (tutorialStep > 2) msg += "[x] Cleanup done\n";

            if (tutorialStep === 3) msg += "> Place Cash Register (Menu Y)\n";
            else if (tutorialStep > 3) msg += "[x] Register placed\n";

            if (tutorialStep === 4) msg += "> Place Coffee Machine (Menu Y)\n";
            else if (tutorialStep > 4) msg += "[x] Machine placed\n";

            if (tutorialStep === 5) msg += "> Serve coffee to customer\n";
            else if (tutorialStep > 5) msg += "[x] Customer served\n";

            if (tutorialStep === 6) msg += "> Collect the Bill (-> Register)\n";
            else if (tutorialStep > 6) msg += "[x] Setup Complete!\n";

            tutorialText.setAttribute('value', msg);

            // Tutorial finished -> start game mode
            if (tutorialStep === 7) {
                setTimeout(function () {
                    startGameMode();
                }, 3000);
            }
        }

        function createTutorialUI() {
            const cam = document.getElementById('cam');
            if (!cam) return;

            const panel = document.createElement('a-entity');
            panel.setAttribute('position', '0.2 0.15 -0.8');
            panel.setAttribute('rotation', '0 -10 0');

            const bg = document.createElement('a-plane');
            bg.setAttribute('width', '0.5');
            bg.setAttribute('height', '0.35');
            bg.setAttribute('color', '#1a1a2e');
            bg.setAttribute('opacity', '0.85');
            bg.setAttribute('side', 'double');
            panel.appendChild(bg);

            // Border glow
            const border = document.createElement('a-plane');
            border.setAttribute('width', '0.52');
            border.setAttribute('height', '0.37');
            border.setAttribute('color', '#00FF88');
            border.setAttribute('opacity', '0.3');
            border.setAttribute('position', '0 0 -0.001');
            panel.appendChild(border);

            tutorialText = document.createElement('a-text');
            tutorialText.setAttribute('value', 'Loading...');
            tutorialText.setAttribute('align', 'left');
            tutorialText.setAttribute('position', '-0.22 0.1 0.01');
            tutorialText.setAttribute('width', '0.8');
            tutorialText.setAttribute('color', '#FFFFFF');
            tutorialText.setAttribute('font', 'mozillavr');
            panel.appendChild(tutorialText);

            cam.appendChild(panel);
            tutorialUI = panel;
            updateTutorialUI();
        }

        function spawnShovel() {
            // Get player position from camera
            var cam = document.getElementById('cam');
            var cx = 0, cy = 0, cz = 0;
            if (cam && cam.object3D) {
                var camPos = new THREE.Vector3();
                cam.object3D.getWorldPosition(camPos);
                cx = camPos.x;
                cy = camPos.y;
                cz = camPos.z;
            }

            // Spawn DustPan in front of player (~1m ahead, at waist height)
            var dustpan = document.createElement('a-entity');
            dustpan.setAttribute('gltf-model', 'url(models/DustPan.glb)');
            dustpan.setAttribute('scale', '0.3 0.3 0.3');
            dustpan.setAttribute('position', cx + ' ' + (cy - 0.3) + ' ' + (cz - 1));
            dustpan.setAttribute('class', 'clickable grabbable dustpan-tool');

            sceneEl.appendChild(dustpan);
            spawnedObjects.push(dustpan);

            // Spawn Trashcan (on floor, slightly right of player)
            var trashcan = document.createElement('a-entity');
            trashcan.setAttribute('gltf-model', 'url(models/TrashcanSmall.glb)');
            trashcan.setAttribute('scale', '0.5 0.5 0.5');
            trashcan.setAttribute('position', (cx + 0.5) + ' 0 ' + (cz - 1));
            trashcan.setAttribute('class', 'trashcan');

            sceneEl.appendChild(trashcan);
            trashcans.push(trashcan);

            console.log('DustPan and Trashcan spawned near player');
        }

        // --- COFFEE MACHINE AUDIO SETUP ---
        function initCoffeeAudio() {
            coffeeAudio = new Audio('/sounds/public_assets_café.MP3');
            coffeeAudio.volume = 0.7;
        }
        initCoffeeAudio();

        // --- SPAWN COFFEE CUP FUNCTION ---
        function spawnCoffeeCup(machineEntity) {
            if (!machineEntity || !machineEntity.object3D) return;

            const machinePos = new THREE.Vector3();
            machineEntity.object3D.getWorldPosition(machinePos);

            // Position à droite de la machine (offset de 0.15m sur X)
            const cupPos = {
                x: machinePos.x + 0.15,
                y: machinePos.y + 0.05, // Légèrement au dessus du sol
                z: machinePos.z
            };

            const cup = document.createElement('a-entity');
            cup.setAttribute('gltf-model', 'url(models/Coffeecup.glb)');
            cup.setAttribute('scale', '0.14 0.14 0.14'); // Bigger cup as requested
            cup.setAttribute('position', `${cupPos.x} ${cupPos.y} ${cupPos.z}`);
            cup.setAttribute('dynamic-body', 'mass:0.3;linearDamping:0.5;angularDamping:0.5');
            cup.setAttribute('class', 'clickable grabbable');
            cup.classList.add('coffee-cup'); // Ajouter classe spécifique
            cup.id = `coffee-cup-${Date.now()}`;

            // Marquer comme objet café pour le grab
            cup.dataset.isCoffee = 'true';

            // COLLISION LISTENER ON CUP (More reliable for dynamic bodies)
            cup.addEventListener('collide', (e) => {
                const collidedEl = e.detail.body.el;
                if (!collidedEl) return;

                // Check if we hit a customer
                if (collidedEl.classList.contains('customer')) {
                    console.log('☕ CUP HIT CUSTOMER!');
                    if (typeof deliverCoffee === 'function') {
                        deliverCoffee(collidedEl, cup);
                    }
                }
            });

            sceneEl.appendChild(cup);
            spawnedObjects.push(cup);

            console.log('☕ Tasse de café créée à:', cupPos);
            if (debugEl) debugEl.textContent = '☕ Café prêt!';
        }

        // --- COFFEE MACHINE INTERACTION ---
        function handleCoffeeMachineClick(machineEntity) {
            if (coffeeMachineLock) return; // Déjà en cours
            coffeeMachineLock = true;

            console.log('☕ Machine à café activée!');
            if (debugEl) debugEl.textContent = '☕ Préparation du café...';

            // Jouer le son
            if (coffeeAudio) {
                coffeeAudio.currentTime = 0;
                coffeeAudio.play().catch(e => console.log('Audio error:', e));
            }

            // Attendre 1.5 secondes puis faire apparaître la tasse
            setTimeout(() => {
                spawnCoffeeCup(machineEntity);
                coffeeMachineLock = false; // Débloquer pour le prochain café
            }, 1500);
        }

        // --- TRASHCAN DELETION SYSTEM ---
        const trashcans = []; // Liste des poubelles dans la scène
        const TRASH_RADIUS = 0.4; // Rayon de détection élargi (0.2 -> 0.4)
        let giveCoffeeLock = false; // Lock pour donner le café
        var bgMusic = null; // Musique de fond
        var dollarCubeEl = null; // Cube vert pre-cree (billet)

        function removeObjectFromScene(objEl) {
            if (!objEl || !objEl.parentNode) return;

            // Remove from spawnedObjects array
            const idx = spawnedObjects.indexOf(objEl);
            if (idx > -1) {
                spawnedObjects.splice(idx, 1);
            }

            // Remove physics body if exists
            if (objEl.body) {
                objEl.body.world.removeBody(objEl.body);
            }

            // Remove from scene
            objEl.parentNode.removeChild(objEl);

            console.log('🗑️ Objet supprimé par la poubelle!');
            if (debugEl) debugEl.textContent = '🗑️ Objet jeté!';

            // TUTORIAL STEP 2 CHECK: Shovel Removed (Check Step OR Class)
            if (tutorialStep === 2) {
                // If it was the shovel (either tutorial one or shop one)
                if (objEl.classList.contains('shovel-tool') || objEl.classList.contains('dustpan-tool')) {
                    tutorialStep = 3;
                    updateTutorialUI();
                    // showARNotification removed: TODO panel is sufficient
                }
            }
        }

        function checkTrashcanCollisions() {
            if (trashcans.length === 0) return;

            const trashPos = new THREE.Vector3();
            const objPos = new THREE.Vector3();

            // Pour chaque poubelle
            trashcans.forEach(trashcan => {
                if (!trashcan || !trashcan.object3D) return;
                trashcan.object3D.getWorldPosition(trashPos);

                // Vérifier chaque objet spawned (sauf les poubelles elles-mêmes)
                const objectsToCheck = [...spawnedObjects].filter(obj =>
                    obj && !obj.classList.contains('trashcan')
                );

                objectsToCheck.forEach(obj => {
                    if (!obj || !obj.object3D) return;
                    obj.object3D.getWorldPosition(objPos);

                    const distance = trashPos.distanceTo(objPos);

                    if (distance < TRASH_RADIUS) {
                        removeObjectFromScene(obj);
                    }
                });

                // Vérifier aussi le cube de base
                if (cubeEl && cubeEl.object3D) {
                    cubeEl.object3D.getWorldPosition(objPos);
                    const distance = trashPos.distanceTo(objPos);
                    if (distance < TRASH_RADIUS) {
                        removeObjectFromScene(cubeEl);
                    }
                }
            });
        }

        // --- WELCOME PANEL (Intro Screen) ---
        let welcomePanel = null;

        function createWelcomePanel() {
            const cam = document.getElementById('cam');
            if (!cam) return;

            welcomePanel = document.createElement('a-entity');
            welcomePanel.setAttribute('position', '0 0 -1.2'); // 1.2m devant la caméra
            welcomePanel.setAttribute('rotation', '0 0 0');

            // --- PAPER BACKGROUND ---
            const paper = document.createElement('a-plane');
            paper.setAttribute('width', '1.02');
            paper.setAttribute('height', '1.24');
            paper.setAttribute('color', '#f5f0e1'); // Couleur papier vieilli
            paper.setAttribute('material', 'shader: flat; side: double');
            paper.setAttribute('position', '0 0 0');
            // Légère rotation pour effet manuscrit
            // paper.setAttribute('rotation', '0 0 -2');
            welcomePanel.appendChild(paper);

            // --- PAPER BORDER (Shadow effect) ---
            const shadow = document.createElement('a-plane');
            shadow.setAttribute('width', '1.04');
            shadow.setAttribute('height', '1.26');
            shadow.setAttribute('color', '#8b7355');
            shadow.setAttribute('opacity', '0.3');
            shadow.setAttribute('position', '0.01 -0.01 -0.01');
            // shadow.setAttribute('rotation', '0 0 -2');
            welcomePanel.appendChild(shadow);

            // --- TITLE ---
            const title = document.createElement('a-text');
            title.setAttribute('value', '~ HOLO BARISTA ~');
            title.setAttribute('align', 'center');
            title.setAttribute('position', '0 0.56 0.01');
            title.setAttribute('width', '1.5');
            title.setAttribute('color', '#2d1810'); // Brun foncé
            title.setAttribute('font', 'mozillavr');
            welcomePanel.appendChild(title);

            // --- DECORATIVE LINE ---
            const line = document.createElement('a-plane');
            line.setAttribute('width', '0.5');
            line.setAttribute('height', '0.003');
            line.setAttribute('color', '#8b4513');
            line.setAttribute('position', '0 0.16 0.01');
            welcomePanel.appendChild(line);

            // --- INTRO TEXT ---
            const introText = document.createElement('a-text');
            introText.setAttribute('value',
                'Welcome to Holo Barista!\\n\\n' +
                'You are the barista of a virtual coffee shop.\\n' +
                'Your mission: serve delicious coffee!\\n\\n' +
                '~ HOW TO PLAY ~\\n\\n' +
                '1. Press Y to open the VR Store\\n' +
                '2. Place a Coffee Machine\\n' +
                '3. Point at it and press B to brew\\n' +
                '4. Grab the cup and serve!\\n' +
                '5. Use the Trash to clean up\\n\\n' +
                'Good luck, barista!'
            );
            introText.setAttribute('align', 'center');
            introText.setAttribute('position', '0 -0.02 0.01');
            introText.setAttribute('width', '1.1');
            introText.setAttribute('color', '#3d2914');
            introText.setAttribute('line-height', '55');
            welcomePanel.appendChild(introText);

            // --- CLOSE BUTTON ---
            const closeBtn = document.createElement('a-box');
            closeBtn.setAttribute('width', '0.2');
            closeBtn.setAttribute('height', '0.06');
            closeBtn.setAttribute('depth', '0.02');
            closeBtn.setAttribute('color', '#8b4513');
            closeBtn.setAttribute('position', '0 -0.55 0.02');
            closeBtn.setAttribute('class', 'clickable');
            closeBtn.id = 'welcome-close-btn';

            // Button text
            const closeTxt = document.createElement('a-text');
            closeTxt.setAttribute('value', 'START');
            closeTxt.setAttribute('align', 'center');
            closeTxt.setAttribute('position', '0 0.01 0.02');
            closeTxt.setAttribute('width', '1.2');
            closeTxt.setAttribute('color', '#f5f0e1');
            closeBtn.appendChild(closeTxt);

            // Hover effect
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.setAttribute('color', '#a0522d');
                closeBtn.setAttribute('scale', '1.1 1.1 1.1');
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.setAttribute('color', '#8b4513');
                closeBtn.setAttribute('scale', '1 1 1');
            });

            welcomePanel.appendChild(closeBtn);

            cam.appendChild(welcomePanel);
            console.log('📜 Welcome Panel Created');

            return welcomePanel;
        }

        function closeWelcomePanel() {
            if (welcomePanel && welcomePanel.parentNode) {
                welcomePanel.parentNode.removeChild(welcomePanel);
                welcomePanel = null;
                debugEl.textContent = '🟢 PANEL FERMÉ';
                // Trigger initial customer spawn -> REMOVED (Handled by Tutorial now)
                // setTimeout(spawnCustomer, 2000); 
            }
        }

        // ... (lines 346-1188 unchanged usually, but I need to jump to customer section)
        // I will use multi_replace if I could, but here I am replacing start and end block?
        // Wait, replace_file_content replaces contiguous block.
        // I need to replace closeWelcomePanel (lines 307-344) AND customer logic (lines 1191+).
        // Since they are far apart, I should use multi_replace.
        // But the prompt below says "Instruction: Remove test code from closeWelcomePanel and update customer logic."
        // I will use multi_replace_file_content.

        // Wait, I am calling replace_file_content.
        // I must target contiguous block.
        // I will do 2 separate calls or use multi_replace.
        // I'll restart and use multi_replace_file_content.


        // --- 3D INVENTORY HUD (Attached to Camera) ---
        let inventoryEntity = null;

        function createHUDInventory() {
            const menu = document.createElement('a-entity');
            inventoryEntity = menu;
            menu.setAttribute('visible', 'false'); // HIDDEN BY DEFAULT

            // Attach to Camera (HUD)
            const cam = document.getElementById('cam');
            if (!cam) return;

            // Position: Adjusted for new scale
            menu.setAttribute('position', '0 -0.2 -0.8');
            menu.setAttribute('rotation', '-15 0 0'); // Tilted up to face eyes
            menu.setAttribute('scale', '0.5 0.5 0.5'); // COMPACT SCALE

            // --- SIMPLE BACKGROUND (Plane) ---
            // Changed from Box to Plane to avoid Z-fighting/blocking issues
            const bg = document.createElement('a-plane');
            bg.setAttribute('width', '1.6');
            bg.setAttribute('height', '1.4');
            bg.setAttribute('color', '#000000');
            bg.setAttribute('opacity', '0.6'); // More transparent
            bg.setAttribute('shader', 'flat'); // Simple shader, no lighting issues
            bg.setAttribute('position', '0 -0.05 -0.01'); // Behind items
            menu.appendChild(bg);

            // Removed "Border" box to simplify view

            // Title
            const title = document.createElement('a-text');
            title.setAttribute('value', 'VR STORE');
            title.setAttribute('align', 'center');
            title.setAttribute('position', '0 0.55 0.03'); // Top
            title.setAttribute('width', '4');
            title.setAttribute('color', '#ffffff');
            title.setAttribute('font', 'mozillavr');
            title.setAttribute('letter-spacing', '2');
            menu.appendChild(title);

            // Decorative Line
            const line = document.createElement('a-plane');
            line.setAttribute('width', '1.0');
            line.setAttribute('height', '0.003');
            line.setAttribute('color', '#00cec9');
            line.setAttribute('position', '0 0.48 0.03');
            menu.appendChild(line);

            // Item Config
            // menuScale = taille dans le menu HUD (petit pour l'aperçu)
            // spawnScale = taille réelle dans la scène 3D
            const items = [
                // Row 1: Primitives + Basics
                { type: 'gltf', model: 'models/CoffeeMachine.glb', color: '#fab1a0', label: 'COFFEE', menuScale: '0.2 0.2 0.2', spawnScale: '0.4 0.4 0.4' },
                { type: 'gltf', model: 'models/TrashcanSmall.glb', color: '#a29bfe', label: 'TRASH', menuScale: '0.2 0.2 0.2', spawnScale: '0.8 0.8 0.8' },
                // Row 2 
                { type: 'gltf', label: 'SPEAKER', model: 'models/BassSpeakers.glb', color: '#fff', menuScale: '0.1 0.1 0.1', spawnScale: '0.8 0.8 0.8' },
                { type: 'gltf', label: 'BROOM', model: 'models/Broom.glb', color: '#fff', menuScale: '0.001 0.001 0.001', spawnScale: '0.004 0.004 0.004' },
                { type: 'gltf', label: 'REGISTER', model: 'models/Cashregister.glb', color: '#fff', menuScale: '0.007 0.007 0.007', spawnScale: '0.03 0.03 0.03' },
                { type: 'gltf', label: 'DUSTPAN', model: 'models/DustPan.glb', color: '#fff', menuScale: '0.08 0.08 0.08', spawnScale: '0.25 0.25 0.25' },
                // Row 3
                { type: 'gltf', label: 'SIGN', model: 'models/Coffeesign.glb', color: '#fff', menuScale: '0.04 0.04 0.04', spawnScale: '0.2 0.2 0.2' },
                { type: 'gltf', label: 'COUCH', model: 'models/Couch.glb', color: '#fff', menuScale: '0.08 0.08 0.08', spawnScale: '0.3 0.3 0.3' },
                { type: 'gltf', label: 'PLANT', model: 'models/Houseplant.glb', color: '#fff', menuScale: '0.1 0.1 0.1', spawnScale: '0.4 0.4 0.4' },
                { type: 'gltf', label: 'RUG', model: 'models/Rug.glb', color: '#fff', menuScale: '0.05 0.05 0.05', spawnScale: '0.4 0.4 0.4' }
            ];

            const gap = 0.35;
            const itemsPerRow = 4;
            const startX = -((itemsPerRow - 1) * gap) / 2;

            items.forEach((item, index) => {
                const row = Math.floor(index / itemsPerRow);
                const col = index % itemsPerRow;

                const x = startX + (col * gap);
                // Row 0: 0.25, Row 1: -0.15, Row 2: -0.55
                const y = 0.25 - (row * 0.4);

                // CONTAINER
                const btnGroup = document.createElement('a-entity');
                btnGroup.setAttribute('position', `${x} ${y} 0.05`);

                // CARD BACKGROUND (Clickable)
                const btn = document.createElement('a-box');
                btn.setAttribute('width', '0.28');
                btn.setAttribute('height', '0.32');
                btn.setAttribute('depth', '0.02');
                btn.setAttribute('color', '#2d3436');
                btn.setAttribute('opacity', '0.9');
                btn.setAttribute('class', 'clickable');

                // Spawn Data
                btn.dataset.spawnType = item.type;
                btn.dataset.spawnColor = item.color;
                if (item.model) btn.dataset.spawnModel = item.model;
                if (item.spawnScale) btn.dataset.spawnScale = item.spawnScale; // Taille de spawn

                // Hover Effects
                btn.addEventListener('mouseenter', () => {
                    btn.setAttribute('color', '#636e72');
                    btn.setAttribute('scale', '1.1 1.1 1.1');
                    const icon = btnGroup.querySelector('.item-icon');
                    if (icon) icon.setAttribute('animation', 'property: rotation; to: 25 385 0; dur: 800; easing: easeInOutQuad');
                });
                btn.addEventListener('mouseleave', () => {
                    btn.setAttribute('color', '#2d3436');
                    btn.setAttribute('scale', '1 1 1');
                    const icon = btnGroup.querySelector('.item-icon');
                    if (icon) icon.removeAttribute('animation');
                });

                btnGroup.appendChild(btn);

                // 3D ICON (Preview)
                // 3D ICON (Preview)
                let icon;
                if (item.type === 'gltf') {
                    icon = document.createElement('a-entity');
                    icon.setAttribute('gltf-model', `url(${item.model})`);
                    icon.setAttribute('scale', item.menuScale || '0.08 0.08 0.08'); // Taille dans le menu
                } else {
                    icon = document.createElement(`a-${item.type}`);
                    icon.setAttribute('scale', '0.06 0.06 0.06');
                    icon.setAttribute('material', `color: ${item.color}; metalness: 0.5; roughness: 0.1`);
                }

                icon.setAttribute('position', '0 0.04 0.06');
                icon.setAttribute('rotation', '25 25 0');
                icon.setAttribute('class', 'item-icon');
                btnGroup.appendChild(icon);

                // LABEL
                const label = document.createElement('a-text');
                label.setAttribute('value', item.label);
                label.setAttribute('align', 'center');
                label.setAttribute('position', '0 -0.11 0.06');
                label.setAttribute('width', '1.4');
                label.setAttribute('color', '#dfe6e9');
                btnGroup.appendChild(label);

                menu.appendChild(btnGroup);
            });

            cam.appendChild(menu);
            console.log('🛍️ HUD Upgrade Complete: Custom Models');
            return menu;
        }

        let lastSpawnTime = 0;

        function spawnObject(type, color, model, customScale) {
            const now = Date.now();
            if (now - lastSpawnTime < 500) {
                console.warn('⚠️ Spawn rate limited');
                return;
            }
            lastSpawnTime = now;

            // Get camera position and direction
            // FORCE RELEASE ANY GRABBED OBJECT (Fix Head Tracking Glitch)
            if (grabbed) release();

            // Get camera position and direction
            const cam = document.getElementById('cam');
            const camPos = new THREE.Vector3();
            const camDir = new THREE.Vector3();

            if (cam) {
                cam.object3D.getWorldPosition(camPos);
                cam.object3D.getWorldDirection(camDir);
            } else {
                return; // Safety
            }

            // Spawn 1.5m in front of camera
            // getWorldDirection retourne la direction vers laquelle on regarde (axe -Z)
            // On utilise cette direction directement, mais on inverse si nécessaire
            const spawnPos = camPos.clone().add(camDir.multiplyScalar(-1.5)); // Négatif car cam regarde vers -Z
            spawnPos.y = Math.max(spawnPos.y, 0.1); // Au moins 10cm du sol

            console.log('✨ SPAWNING at:', spawnPos);

            // Create entity based on type
            let entity;
            switch (type) {
                case 'sphere':
                    entity = document.createElement('a-sphere');
                    entity.setAttribute('radius', '0.08');
                    break;
                case 'cylinder':
                    entity = document.createElement('a-cylinder');
                    entity.setAttribute('radius', '0.06');
                    entity.setAttribute('height', '0.15');
                    break;
                case 'gltf':
                    entity = document.createElement('a-entity');
                    entity.setAttribute('gltf-model', `url(${model})`);
                    // Utiliser le scale personnalisé ou un défaut de 0.1
                    entity.setAttribute('scale', customScale || '0.1 0.1 0.1');
                    break;
                case 'tetrahedron':
                    entity = document.createElement('a-tetrahedron');
                    entity.setAttribute('radius', '0.1');
                    break;
                default: // box
                    entity = document.createElement('a-box');
                    entity.setAttribute('width', '0.12');
                    entity.setAttribute('height', '0.12');
                    entity.setAttribute('depth', '0.12');
            }

            entity.setAttribute('position', `${spawnPos.x} ${spawnPos.y} ${spawnPos.z}`);
            entity.setAttribute('color', color);
            entity.setAttribute('dynamic-body', 'mass:0.5;linearDamping:0.3;angularDamping:0.3');
            entity.setAttribute('class', 'clickable grabbable');
            entity.id = `spawned-${now}`;

            // Si c'est une pelle, ajouter une classe spécifique pour le tutoriel/poubelle
            if (model && model.includes('DustPan')) {
                entity.classList.add('dustpan-tool');
            }

            // Si c'est une poubelle, l'ajouter à la liste des trashcans (mais garde la même physique)
            if (model && model.includes('Trashcan')) {
                entity.classList.add('trashcan');
                trashcans.push(entity);
            }

            // TUTORIAL STEP 3 CHECK: Cash Register Placed
            if (tutorialStep === 3 && model && model.includes('Cashregister')) {
                tutorialStep = 4;
                updateTutorialUI();
                // notification removed: TODO panel sufficient
            }

            // TUTORIAL STEP 4 CHECK: Machine Placed
            if (tutorialStep === 4 && model && model.includes('CoffeeMachine')) {
                tutorialStep = 5;
                updateTutorialUI();
                // notification removed: TODO panel sufficient
                setTimeout(spawnCustomer, 2000); // Allow customer now
            }

            sceneEl.appendChild(entity);
            spawnedObjects.push(entity);

            const debugEl = document.getElementById('debug');
            if (debugEl) debugEl.textContent = `Spawné: ${type}`;
            console.log(`📦 Spawned ${type} at`, spawnPos);
        }

        // --- START BUTTON HANDLER (Landing Page → Loader → AR) ---
        startBtn.onclick = async () => {
            console.log('☕ Start button clicked!');

            // 1. Hide landing page
            if (landingPage) {
                landingPage.style.display = 'none';
            }

            // 2. Show loader
            if (gameContainer) {
                gameContainer.classList.remove('hidden');
                gameContainer.classList.add('visible');
            }

            // 3. After loader delay, launch AR
            setTimeout(async () => {
                // Hide loader, show scene
                if (gameContainer) {
                    gameContainer.classList.remove('visible');
                    gameContainer.classList.add('hidden');
                }
                if (sceneEl) {
                    sceneEl.style.display = 'block';
                }

                if (debugEl) debugEl.textContent = 'Démarrage AR...';

                try {
                    xrSession = await navigator.xr.requestSession('immersive-ar', {
                        requiredFeatures: ['local-floor'],
                        optionalFeatures: ['hit-test', 'dom-overlay'],
                        domOverlay: { root: document.getElementById('overlay') }
                    });

                    sceneEl.renderer.xr.setSession(xrSession);

                    // Controllers Three.js
                    const ctrl0 = sceneEl.renderer.xr.getController(0);
                    const ctrl1 = sceneEl.renderer.xr.getController(1);

                    // Identify Handedness
                    ctrl0.addEventListener('connected', (e) => {
                        const handedness = e.data.handedness;
                        if (handedness === 'right') window.rightController = ctrl0;
                        if (handedness === 'left') window.leftController = ctrl0; // Capture Left
                    });
                    ctrl1.addEventListener('connected', (e) => {
                        const handedness = e.data.handedness;
                        if (handedness === 'right') window.rightController = ctrl1;
                        if (handedness === 'left') window.leftController = ctrl1; // Capture Left
                    });

                    sceneEl.object3D.add(ctrl0);
                    sceneEl.object3D.add(ctrl1);

                    ctrl0.addEventListener('selectstart', () => grab(ctrl0));
                    ctrl0.addEventListener('selectend', release);
                    ctrl1.addEventListener('selectstart', () => grab(ctrl1));
                    ctrl1.addEventListener('selectend', release);

                    // CREATE WELCOME PANEL FIRST
                    createWelcomePanel();

                    // START TUTORIAL
                    setTimeout(() => {
                        tutorialStep = 1;
                        createTutorialUI();
                        // spawnDirtyCup(); // Wait for floor cleaning first
                    }, 500);

                    // CREATE HUD MENU (but hidden)
                    createHUDInventory();

                    // Lancer musique de fond
                    try {
                        bgMusic = new Audio('sounds/bg_music.mp3');
                        bgMusic.loop = true;
                        bgMusic.volume = 0.15;
                        bgMusic.play().catch(function (e) { console.warn('BG music autoplay blocked:', e); });
                    } catch (e) { console.warn('BG music error:', e); }

                    if (debugEl) debugEl.textContent = 'AR OK! Read the instructions';

                    // Setup hit-test après délai
                    setTimeout(async () => {
                        try {
                            xrRefSpace = sceneEl.renderer.xr.getReferenceSpace();
                            const viewer = await xrSession.requestReferenceSpace('viewer');
                            hitTestSource = await xrSession.requestHitTestSource({ space: viewer });
                            if (debugEl) debugEl.textContent = 'Hit-test OK!';
                        } catch (e) {
                            if (debugEl) debugEl.textContent = 'Pas de hit-test';
                        }

                        // Démarrer boucle XR
                        xrSession.requestAnimationFrame(xrLoop);
                    }, 500);

                } catch (e) {
                    if (debugEl) debugEl.textContent = 'Erreur: ' + e.message;
                    console.error('Erreur AR:', e.message);
                    // Show scene anyway on error
                    if (sceneEl) sceneEl.style.display = 'block';
                }
            }, 2500); // Loader delay (2.5 seconds)
        };

        function xrLoop(time, frame) {
            if (!xrSession) return;
            xrSession.requestAnimationFrame(xrLoop);

            if (!frame || !xrRefSpace) {
                xrRefSpace = sceneEl.renderer.xr.getReferenceSpace();
                return;
            }

            if (hitTestSource) {
                try {
                    const hits = frame.getHitTestResults(hitTestSource);
                    if (hits.length > 0) {
                        const pose = hits[0].getPose(xrRefSpace);
                        if (pose) {
                            const p = pose.transform.position;
                            const r = pose.transform.orientation;

                            cursorEl.object3D.visible = true;
                            cursorEl.object3D.position.set(p.x, p.y, p.z);

                            // ORIENTATION FIX:
                            if (r) {
                                const poseRot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
                                const offset = new THREE.Quaternion();
                                offset.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // -90 deg X
                                poseRot.multiply(offset);
                                cursorEl.object3D.quaternion.copy(poseRot);
                            } else {
                                // Fallback if no rotation data: Flat on floor
                                cursorEl.object3D.rotation.set(-Math.PI / 2, 0, 0);
                            }

                            addSurface(p.x, p.y, p.z);
                        }
                    } else {
                        cursorEl.object3D.visible = false;
                    }
                } catch (e) {
                    console.error("Hit test error:", e);
                }
            }

            // --- TRASHCAN COLLISION CHECK ---
            checkTrashcanCollisions();

            // --- COFFEE DELIVERY CHECK ---
            checkCoffeeDelivery();

            // --- MANUEL RAYCASTER & DIAGNOSTICS ---

            const ses = sceneEl.renderer.xr.getSession();

            // 2. Diagnostics Panel Loop
            if (ses) {
                let isAnyBtnPressed = false;

                // Checking Input Sources
                for (const source of ses.inputSources) {
                    if (!source.gamepad) continue;

                    // --- JOYSTICK ROTATION LOGIC ---
                    // Verify if this source is the one holding the object
                    // We need to match the source to the controller entity (ctrl0/ctrl1)
                    // Simplified: If ANY joystick is moved and we have a grabbed object, rotate it.
                    // Ideally check handedness matches grabController.

                    if (grabbed && currentGrabbedEl && source.gamepad.axes.length >= 2) {
                        const rotSpeed = 0.05;

                        // DUAL JOYSTICK CONTROL
                        // Left Controller: Yaw (Left/Right)
                        if (source.handedness === 'left') {
                            const axisX = source.gamepad.axes[2] !== undefined ? source.gamepad.axes[2] : source.gamepad.axes[0];
                            if (Math.abs(axisX) > 0.1) {
                                currentGrabbedEl.object3D.rotation.y += -axisX * rotSpeed;

                                if (currentGrabbedEl.body) {
                                    const q = currentGrabbedEl.object3D.quaternion;
                                    currentGrabbedEl.body.quaternion.set(q.x, q.y, q.z, q.w);
                                }
                            }
                        }

                        // Right Controller: Pitch (Up/Down)
                        if (source.handedness === 'right') {
                            const axisY = source.gamepad.axes[3] !== undefined ? source.gamepad.axes[3] : source.gamepad.axes[1];
                            if (Math.abs(axisY) > 0.1) {
                                currentGrabbedEl.object3D.rotation.x += -axisY * rotSpeed;

                                if (currentGrabbedEl.body) {
                                    const q = currentGrabbedEl.object3D.quaternion;
                                    currentGrabbedEl.body.quaternion.set(q.x, q.y, q.z, q.w);
                                }
                            }
                        }
                    }

                    // LEFT CONTROLLER - Menu Toggle
                    // LEFT CONTROLLER - Menu Toggle (Button 4/5 usually X/Y)
                    if (source.handedness === 'left' && source.gamepad) {
                        // Button 5 is usually 'Y' on Quest
                        const yBtn = source.gamepad.buttons[5] || source.gamepad.buttons[4] || source.gamepad.buttons[3];

                        if (yBtn && yBtn.pressed) {
                            if (!menuToggleLock) {
                                menuToggleLock = true;
                                if (inventoryEntity) {
                                    const vis = inventoryEntity.getAttribute('visible');
                                    inventoryEntity.setAttribute('visible', !vis);
                                    console.log('Toggle Menu:', !vis);
                                }
                            }
                        } else {
                            if (menuToggleLock) menuToggleLock = false;
                        }
                    }

                    // RIGHT CONTROLLER - Debug buttons + Give coffee
                    if (source.handedness === 'right' && source.gamepad) {
                        // Debug: afficher tous les boutons pressés
                        for (let bi = 0; bi < source.gamepad.buttons.length; bi++) {
                            if (source.gamepad.buttons[bi].pressed) {
                                debugEl.textContent = `BTN ${bi} | Grab:${grabbed} | Cup:${currentGrabbedEl ? 'yes' : 'no'} | Cust:${customers.length}`;
                            }
                        }

                        // Essayer TOUS les boutons possibles pour A (4, 3, ou autre)
                        const aBtn = source.gamepad.buttons[4] || source.gamepad.buttons[3];

                        if (aBtn && aBtn.pressed && !giveCoffeeLock) {
                            debugEl.textContent = `A pressed! Grab:${grabbed}`;
                        }
                    }

                    // RIGHT CONTROLLER - Button B = Coffee Machine Interaction
                    if (source.handedness === 'right' && source.gamepad) {
                        // Button 5 is usually 'B' on Quest
                        const bBtn = source.gamepad.buttons[5];

                        if (bBtn && bBtn.pressed && !coffeeMachineLock) {
                            // Raycast from right controller to detect coffee machine
                            const rightCtrl = window.rightController;
                            if (rightCtrl) {
                                const tempMatrix = new THREE.Matrix4();
                                tempMatrix.identity().extractRotation(rightCtrl.matrixWorld);

                                const raycaster = new THREE.Raycaster();
                                raycaster.ray.origin.setFromMatrixPosition(rightCtrl.matrixWorld);
                                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
                                raycaster.far = 5.0; // 5 mètres de portée

                                // Find all coffee machines in spawnedObjects
                                const coffeeMachines = [];
                                spawnedObjects.forEach(obj => {
                                    if (obj && obj.object3D) {
                                        // Check if it's a coffee machine (by gltf-model attribute)
                                        const model = obj.getAttribute('gltf-model');
                                        if (model && model.includes('CoffeeMachine')) {
                                            obj.object3D.traverse(child => {
                                                if (child.isMesh) {
                                                    child.el = obj; // Reference to A-Frame entity
                                                    coffeeMachines.push(child);
                                                }
                                            });
                                        }
                                    }
                                });

                                const intersects = raycaster.intersectObjects(coffeeMachines);

                                if (intersects.length > 0) {
                                    const hitEntity = intersects[0].object.el;
                                    if (hitEntity) {
                                        handleCoffeeMachineClick(hitEntity);
                                    }
                                }
                            }
                        }
                    }

                    // CHECK FOR ANY CLICK (For both hands)
                    if (source.gamepad) {
                        // Usually Trigger is button 0
                        if (source.gamepad.buttons[0] && source.gamepad.buttons[0].pressed) {
                            isAnyBtnPressed = true;
                        }
                    }
                }

                window.isAnyBtnPressed = isAnyBtnPressed;
                if (!isAnyBtnPressed) {
                    window.uiClickLock = false; // Reset lock when release
                }
            }

            // 3. Interaction Logic (Unified for Both Controllers)

            const handleControllerInteraction = (controller) => {
                if (!controller) return;

                const isMenuVisible = inventoryEntity && inventoryEntity.getAttribute('visible');
                const isWelcomeVisible = welcomePanel !== null;

                let line = controller.getObjectByName('laser-line');
                let cursor = controller.getObjectByName('laser-cursor');

                // Hide laser if neither menu nor welcome panel is visible
                if (!isMenuVisible && !isWelcomeVisible) {
                    if (line) line.visible = false;
                    if (cursor) cursor.visible = false;
                    return;
                }

                if (!line) {
                    const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
                    const lineMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
                    line = new THREE.Line(lineGeom, lineMat);
                    line.name = 'laser-line';
                    controller.add(line);
                }

                if (!cursor) {
                    const cursorGeom = new THREE.RingGeometry(0.02, 0.04, 32);
                    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
                    cursor = new THREE.Mesh(cursorGeom, cursorMat);
                    cursor.name = 'laser-cursor';
                    controller.add(cursor);
                }

                line.visible = true;
                cursor.visible = false; // Hidden unless hit

                // RAYCAST
                const tempMatrix = new THREE.Matrix4();
                tempMatrix.identity().extractRotation(controller.matrixWorld);

                const raycaster = new THREE.Raycaster();
                raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
                raycaster.far = 3.0;

                const buttons = [];

                // Search in inventory menu
                const isShopOpen = inventoryEntity && inventoryEntity.getAttribute('visible') !== 'false';
                if (inventoryEntity && inventoryEntity.object3D && isShopOpen) {
                    inventoryEntity.object3D.traverse(child => {
                        if (child.el && child.el.classList.contains('clickable') && child.isMesh) {
                            buttons.push(child);
                        }
                    });
                }

                // Search in welcome panel
                if (welcomePanel && welcomePanel.object3D) {
                    welcomePanel.object3D.traverse(child => {
                        if (child.el && child.el.classList.contains('clickable') && child.isMesh) {
                            buttons.push(child);
                        }
                    });
                }

                const intersects = raycaster.intersectObjects(buttons);

                // Clear Hovers (Global clear might flicker if both point, but acceptable for now)
                // Better: clear hover only if NOT hovered by other controller? 
                // Simple version: clear always, re-apply if intersection.

                // Note: Clearing globally in a loop inside a per-controller function is slightly buggy if both controllers point.
                // But typically only one points at a time.

                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const el = hit.object.el;
                    const dist = hit.distance;

                    // Update Laser
                    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -dist)];
                    line.geometry.setFromPoints(points);
                    line.geometry.attributes.position.needsUpdate = true;

                    cursor.visible = true;
                    cursor.position.set(0, 0, -dist);

                    // Hover
                    el.setAttribute('scale', '1.1 1.1 1.1');
                    el.setAttribute('color', '#636e72');

                    // CLICK?
                    // We check if THIS controller's trigger is pressed. 
                    // However, we only have global 'isAnyBtnPressed' from the loop above.
                    // Ideally we check specific controller state here.
                    // But for now, using global isAnyBtnPressed is acceptable as requested "cliquer".

                    if (window.isAnyBtnPressed && !window.uiClickLock) {
                        window.uiClickLock = true;

                        // Check if it's the welcome panel close button
                        if (el.id === 'welcome-close-btn') {
                            console.log('📜 Closing Welcome Panel');
                            closeWelcomePanel();
                        }
                        // Otherwise it's a spawn button
                        else if (el.dataset.spawnType) {
                            console.log('SPAWN COMMAND (Left/Right) for', el.dataset.spawnType);
                            el.setAttribute('color', '#00cec9');

                            // FORCE RELEASE to prevent "Head Tracking" glitch
                            if (window.grabbed) {
                                release();
                            }

                            spawnObject(el.dataset.spawnType, el.dataset.spawnColor, el.dataset.spawnModel, el.dataset.spawnScale);
                        }
                    }

                } else {
                    // Reset Laser
                    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2)];
                    line.geometry.setFromPoints(points);
                    line.geometry.attributes.position.needsUpdate = true;
                }
            };

            // Execute for both
            handleControllerInteraction(window.rightController);
            handleControllerInteraction(window.leftController);

            // Objet attrapé suit le controller
            if (grabbed && grabController && currentGrabbedEl) {
                try {
                    const pos = new THREE.Vector3();
                    grabController.getWorldPosition(pos);

                    if (isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
                        currentGrabbedEl.object3D.position.set(pos.x, pos.y, pos.z);

                        // SPECIAL CASE: BROOM OFFSET
                        // Grab by the handle (middle) instead of bottom
                        const model = currentGrabbedEl.getAttribute('gltf-model');
                        if (model && model.includes('Broom')) {
                            // Move the broom down relative to its own rotation so the hand is higher up the stick
                            // Adjust this value based on visual preference (e.g., 0.5m)
                            currentGrabbedEl.object3D.translateY(-0.6);
                        }

                        if (currentGrabbedEl.body) {
                            const p = currentGrabbedEl.object3D.position;
                            currentGrabbedEl.body.position.set(p.x, p.y, p.z);
                        }

                        velocities.push({ x: pos.x, y: pos.y, z: pos.z, t: performance.now() });
                        if (velocities.length > 10) velocities.shift();
                    }
                } catch (e) { }
            }
        }

        // Removed release/grab duplicated definitions if any, used the ones already defined above if valid scopes?
        // Wait, 'grab' and 'release' were defined outside loop in previous version?
        // Let's ensure they are available. In the original file they were inside window.load but outside loop.
        // I am replacing from line 41 to 609, so I am including them.

        function grab(controller) {
            if (grabbed) return;

            // Get controller position
            const ctrlPos = new THREE.Vector3();
            controller.getWorldPosition(ctrlPos);

            // Find the closest grabbable object
            const allGrabbables = [cubeEl, ...spawnedObjects];
            let closestEl = null;
            let closestDist = 0.5; // Max grab distance

            allGrabbables.forEach(el => {
                if (!el || !el.object3D) return;
                const objPos = new THREE.Vector3();
                el.object3D.getWorldPosition(objPos);
                const dist = ctrlPos.distanceTo(objPos);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEl = el;
                }
            });

            if (!closestEl) {
                if (debugEl) debugEl.textContent = 'Rien à attraper';
                return;
            }

            if (debugEl) debugEl.textContent = 'GRAB!';

            grabbed = true;
            grabController = controller;
            currentGrabbedEl = closestEl;
            velocities = [];

            // Store original color
            currentGrabbedEl._originalColor = currentGrabbedEl.getAttribute('color');
            currentGrabbedEl.setAttribute('color', '#FFD700');

            if (currentGrabbedEl.body) {
                currentGrabbedEl.body.mass = 0;
                currentGrabbedEl.body.type = 2; // Kinematic
                currentGrabbedEl.body.collisionResponse = false; // Désactiver les collisions pendant le grab
                currentGrabbedEl.body.updateMassProperties();
            }

            if (debugEl) debugEl.textContent = 'ATTRAPÉ!';
        }

        function release() {
            if (!grabbed || !currentGrabbedEl) return;

            let vx = 0, vy = 0, vz = 0;
            if (velocities.length >= 2) {
                const l = velocities[velocities.length - 1];
                const f = velocities[0];
                const dt = (l.t - f.t) / 1000;
                if (dt > 0.01) {
                    vx = (l.x - f.x) / dt;
                    vy = (l.y - f.y) / dt;
                    vz = (l.z - f.z) / dt;
                }
            }

            // Restore original color
            const originalColor = currentGrabbedEl._originalColor || '#8A2BE2';
            currentGrabbedEl.setAttribute('color', originalColor);

            if (currentGrabbedEl.body) {
                const p = currentGrabbedEl.object3D.position;
                currentGrabbedEl.body.position.set(p.x, p.y, p.z);
                currentGrabbedEl.body.type = 1; // Dynamic
                currentGrabbedEl.body.collisionResponse = true; // Réactiver les collisions
                currentGrabbedEl.body.mass = 0.3; // Masse pour les objets café
                currentGrabbedEl.body.updateMassProperties();
                currentGrabbedEl.body.velocity.set(vx, vy, vz);
                currentGrabbedEl.body.wakeUp();
            }

            grabbed = false;
            grabController = null;
            currentGrabbedEl = null;
            if (debugEl) debugEl.textContent = 'Lâché!';
        }


        function addSurface(x, y, z) {
            for (const s of surfaces) {
                if (Math.abs(s.x - x) < 0.1 && Math.abs(s.y - y) < 0.1 && Math.abs(s.z - z) < 0.1) return;
            }

            const box = document.createElement('a-box');
            box.setAttribute('position', `${x} ${y} ${z}`);
            box.setAttribute('width', '0.2');
            box.setAttribute('height', '0.01');
            box.setAttribute('depth', '0.2');
            box.setAttribute('visible', 'false');
            box.setAttribute('static-body', '');
            sceneEl.appendChild(box);

            surfaces.push({ x, y, z });
            if (surfacesEl) surfacesEl.textContent = 'Surfaces: ' + surfaces.length;

            if (surfaces.length > 200) surfaces.shift();
        }

        // --- STAIN SYSTEM ---
        const stains = [];

        function spawnRandomStain() {
            // Random position around user (assuming floor is roughly y=0)
            // Range: -2m to 2m X/Z
            const x = (Math.random() - 0.5) * 4;
            const z = (Math.random() - 0.5) * 4 - 1.5; // Offset forward slightly
            const y = 0.01; // Slightly above floor

            const stain = document.createElement('a-circle');
            stain.setAttribute('radius', 0.2 + Math.random() * 0.2); // Random size
            stain.setAttribute('rotation', '-90 0 0');
            stain.setAttribute('position', `${x} ${y} ${z}`);
            stain.setAttribute('color', '#5d4037'); // Dirt brown
            stain.setAttribute('opacity', '0.9');
            stain.setAttribute('material', 'shader: flat; transparent: true');
            stain.classList.add('stain');

            sceneEl.appendChild(stain);
            stains.push({ el: stain, health: 100 });
            activeStains++; // Increment count

            console.log('Dirt spot spawned at', x, z);
        }

        // Spawn initial stains (FIXED COUNT: 4)
        setTimeout(() => {
            for (let i = 0; i < 4; i++) spawnRandomStain();
        }, 2000);

        function checkCleaning() {
            // Only if holding the broom
            if (!grabbed || !currentGrabbedEl) return;
            const model = currentGrabbedEl.getAttribute('gltf-model');
            if (!model || !model.includes('Broom')) return;

            // Calculate Broom Tip Position
            // Origin of broom is likely bottom, but we offset the GRAB position.
            // We need the WORLD position of the bottom of the broom.
            // Since we grab it by the handle (offset -0.6), the "bottom" is closer to the true origin of the mesh.
            // But we need the actual world coordinates of the mesh origin (which is the bottom usually).

            // Calculate Broom Tip Position
            const broomPos = new THREE.Vector3();
            currentGrabbedEl.object3D.getWorldPosition(broomPos);

            // Iterate BACKWARDS to safely remove items while looping
            for (let i = stains.length - 1; i >= 0; i--) {
                const stainObj = stains[i];
                if (!stainObj.el || !stainObj.el.parentNode) {
                    stains.splice(i, 1);
                    continue;
                }

                const stainPos = stainObj.el.object3D.position;
                const dist = new THREE.Vector2(broomPos.x, broomPos.z).distanceTo(new THREE.Vector2(stainPos.x, stainPos.z));
                const verticalDist = Math.abs(broomPos.y - stainPos.y);

                // If close enough (Cleaning radius)
                if (dist < 0.4 && verticalDist < 0.5) {
                    // Reduce health
                    stainObj.health -= 5;
                    stainObj.el.setAttribute('opacity', stainObj.health / 100);

                    if (stainObj.health <= 0) {
                        // Remove from DOM
                        if (stainObj.el.parentNode) stainObj.el.parentNode.removeChild(stainObj.el);
                        // Remove from Array
                        stains.splice(i, 1);

                        if (debugEl) debugEl.textContent = 'Tache nettoyée !';
                    }
                }
            }

            // CHECK TUTORIAL PROGRESS (Outside loop)
            // Use stains.length directly for robustness
            if (tutorialStep === 1 && stains.length === 0) {
                tutorialStep = 2;
                updateTutorialUI();
                // Player buys dustpan & trash from shop menu
            }
        }

        // Add checkCleaning to loop (using setInterval or inside xrLoop)
        setInterval(checkCleaning, 50); // 20 times per second

        function showARNotification(message, duration) {
            if (!duration) duration = 2000;
            var cam = document.getElementById('cam');
            if (!cam) return;

            // Remove any existing notifications first
            var old = cam.querySelectorAll('.ar-notif');
            for (var i = 0; i < old.length; i++) {
                if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
            }

            var notification = document.createElement('a-text');
            notification.classList.add('ar-notif');
            notification.setAttribute('value', message);
            notification.setAttribute('align', 'center');
            notification.setAttribute('position', '0 -0.15 -0.8');
            notification.setAttribute('width', '1.2');
            notification.setAttribute('color', '#FFD700');
            notification.setAttribute('opacity', '1');
            notification.setAttribute('font', 'mozillavr');

            cam.appendChild(notification);

            // Animation: fade out puis remove
            setTimeout(() => {
                let opacity = 1;
                const fadeInterval = setInterval(() => {
                    opacity -= 0.05;
                    if (opacity <= 0) {
                        clearInterval(fadeInterval);
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    } else {
                        notification.setAttribute('opacity', opacity.toString());
                    }
                }, 50);
            }, duration);
        }

        // --- CUSTOMER SYSTEM ---
        const customers = [];

        // Create a single customer entity
        function createCustomer(queueIndex) {
            var models = ['models/Punk.glb'];
            var randomModel = models[Math.floor(Math.random() * models.length)];
            var numCoffees = Math.floor(Math.random() * 3) + 1; // 1-3 coffees

            var customer = document.createElement('a-entity');
            customer.setAttribute('gltf-model', 'url(' + randomModel + ')');
            var qz = QUEUE_START_Z - (queueIndex * QUEUE_SPACING);
            customer.setAttribute('position', SERVICE_POS.x + ' 0 ' + qz);
            customer.setAttribute('scale', '1 1 1');
            customer.setAttribute('rotation', '0 0 0');
            customer.classList.add('customer');
            customer.id = 'customer-' + Date.now() + '-' + queueIndex;

            // Order text above head
            var text = document.createElement('a-text');
            text.setAttribute('value', numCoffees + ' Coffee' + (numCoffees > 1 ? 's' : '') + ' please!');
            text.setAttribute('align', 'center');
            text.setAttribute('position', '0 2.2 0.3');
            text.setAttribute('scale', '1 1 1');
            text.setAttribute('color', '#FFD700');
            text.setAttribute('font', 'mozillavr');
            customer.appendChild(text);
            customer._orderText = text;

            // Green circle on floor
            var circle = document.createElement('a-ring');
            circle.setAttribute('radius-inner', '0.4');
            circle.setAttribute('radius-outer', '0.5');
            circle.setAttribute('color', '#00ff00');
            circle.setAttribute('rotation', '-90 0 0');
            circle.setAttribute('position', '0 0.02 0');
            circle.setAttribute('visible', 'false'); // Only visible when being served
            customer.appendChild(circle);
            customer._circle = circle;

            customer._coffees = numCoffees;
            customer._delivered = false;
            customer._queueIndex = queueIndex;

            sceneEl.appendChild(customer);
            return customer;
        }

        // Tutorial mode: spawn single customer
        function spawnCustomer() {
            if (tutorialStep !== 5) return;
            if (customers.length > 0) return;

            var customer = createCustomer(0);
            customer.setAttribute('position', SERVICE_POS.x + ' 0 ' + SERVICE_POS.z);
            customer._circle.setAttribute('visible', 'true');
            customer._coffees = 1; // Tutorial: always 1 coffee
            customer._orderText.setAttribute('value', '1 Coffee please!');
            customers.push(customer);
            showARNotification('New Customer!', 2000);
        }

        // Start game mode after tutorial
        var gameModeStarted = false; // Guard against multiple calls
        function startGameMode() {
            if (gameModeStarted) return;
            gameModeStarted = true;
            try {
                gameMode = true;
                if (debugEl) debugEl.textContent = 'GAME MODE STARTING...';
                showARNotification('Cafe is OPEN! Serve customers!', 4000);
                if (tutorialUI) tutorialUI.setAttribute('visible', 'true');
                spawnCustomerQueue();
            } catch (e) {
                if (debugEl) debugEl.textContent = 'GAME START ERR: ' + e.message;
                console.error('startGameMode error:', e);
            }
        }

        // Spawn a queue of 3 customers
        function spawnCustomerQueue() {
            if (!gameMode) return;
            try {
                // Clear old queue
                for (var i = customerQueue.length - 1; i >= 0; i--) {
                    removeCustomerClean(customerQueue[i]);
                }
                customerQueue = [];
                activeCustomer = null;

                // Create 3 customers in a line
                for (var q = 0; q < 3; q++) {
                    var c = createCustomer(q);
                    customerQueue.push(c);
                }
                if (debugEl) debugEl.textContent = 'Queue: ' + customerQueue.length + ' customers';

                // Advance first customer
                advanceQueue();
            } catch (e) {
                if (debugEl) debugEl.textContent = 'QUEUE ERR: ' + e.message;
                console.error('spawnCustomerQueue error:', e);
            }
        }

        // Move the first customer in queue to service position
        function advanceQueue() {
            try {
                if (customerQueue.length === 0) {
                    activeCustomer = null;
                    coffeesOrdered = 0;
                    coffeesDelivered = 0;
                    billCollected = false;
                    updateTutorialUI();
                    setTimeout(function () {
                        if (gameMode) spawnCustomerQueue();
                    }, 3000);
                    return;
                }

                activeCustomer = customerQueue[0];
                coffeesOrdered = activeCustomer._coffees;
                coffeesDelivered = 0;
                billCollected = false;
                activeCustomer._delivered = false;

                // Animate active customer sliding to service position
                var targetPos = SERVICE_POS.x + ' 0 ' + SERVICE_POS.z;
                activeCustomer.setAttribute('animation', {
                    property: 'position',
                    to: targetPos,
                    dur: 1500,
                    easing: 'easeInOutQuad'
                });
                // Show green circle after animation
                var ac = activeCustomer;
                setTimeout(function () {
                    if (ac && ac._circle) ac._circle.setAttribute('visible', 'true');
                    if (ac) ac.removeAttribute('animation');
                }, 1600);

                // Animate remaining customers sliding forward in queue
                for (var i = 1; i < customerQueue.length; i++) {
                    var qz = QUEUE_START_Z - ((i - 1) * QUEUE_SPACING);
                    var dest = SERVICE_POS.x + ' 0 ' + qz;
                    customerQueue[i].setAttribute('animation', {
                        property: 'position',
                        to: dest,
                        dur: 2000,
                        easing: 'easeInOutQuad'
                    });
                    // Clean up animation attribute after it finishes
                    (function (c) {
                        setTimeout(function () { if (c) c.removeAttribute('animation'); }, 1600);
                    })(customerQueue[i]);
                }

                showARNotification('Customer: ' + coffeesOrdered + ' coffee' + (coffeesOrdered > 1 ? 's' : '') + '!', 3000);
                updateTutorialUI();
            } catch (e) {
                if (debugEl) debugEl.textContent = 'ADVANCE ERR: ' + e.message;
                console.error('advanceQueue error:', e);
            }
        }

        function removeCustomerClean(customer) {
            if (!customer) return;
            var idx = customers.indexOf(customer);
            if (idx > -1) customers.splice(idx, 1);
            customer.setAttribute('visible', 'false');
            try {
                if (customer.body && customer.body.world) customer.body.world.removeBody(customer.body);
            } catch (e) { }
            if (customer.parentNode) customer.parentNode.removeChild(customer);
        }

        function removeCustomer(customer) {
            if (!customer) return;
            var idx = customers.indexOf(customer);
            if (idx > -1) customers.splice(idx, 1);

            // TUTORIAL COMPLETE CHECK
            if (tutorialStep === 4) {
                tutorialStep = 5;
                updateTutorialUI();
            }

            customer.setAttribute('visible', 'false');
            try {
                if (customer.body && customer.body.world) customer.body.world.removeBody(customer.body);
            } catch (e) { }
            if (customer.parentNode) customer.parentNode.removeChild(customer);

            // Tutorial mode: respawn
            if (!gameMode) {
                setTimeout(spawnCustomer, 4000);
            }
        }

        // --- DELIVERY ---
        function deliverCoffee(customer, cupEl) {
            deliveryDebugLock = true;

            // Release grab
            try {
                if (currentGrabbedEl === cupEl) {
                    grabbed = false;
                    grabController = null;
                    currentGrabbedEl = null;
                }
            } catch (e) { }

            // Coffee disappears
            try {
                var ci = spawnedObjects.indexOf(cupEl);
                if (ci > -1) spawnedObjects.splice(ci, 1);
                if (cupEl.parentNode) cupEl.parentNode.removeChild(cupEl);
            } catch (e) {
                try { if (cupEl.object3D) { cupEl.object3D.visible = false; } } catch (e2) { }
            }

            // GAME MODE: track multi-coffee delivery
            if (gameMode && customer === activeCustomer) {
                coffeesDelivered++;
                var remaining = coffeesOrdered - coffeesDelivered;
                if (remaining > 0) {
                    showARNotification(remaining + ' more coffee' + (remaining > 1 ? 's' : '') + ' to go!', 2000);
                    customer._orderText.setAttribute('value', remaining + ' more coffee' + (remaining > 1 ? 's' : ''));
                } else {
                    // All coffees delivered! Show dollar bill
                    customer._delivered = true;
                    showDollarBill(customer);
                    showARNotification('Collect the bill!', 3000);
                    customer._orderText.setAttribute('value', 'Thanks! Here is your bill');
                }
                updateTutorialUI();
                return;
            }

            // TUTORIAL MODE: single coffee
            if (!gameMode) {
                customer._delivered = true;
                try {
                    if (tutorialStep === 5) {
                        tutorialStep = 6;
                        updateTutorialUI();
                    }
                } catch (e) { }
                showDollarBill(customer);
                try { showARNotification('Collect the dollar bill!', 3000); } catch (e) { }
            }

            try { updateTutorialUI(); } catch (e) { }
            if (debugEl) debugEl.textContent = 'Coffee delivered!';
        }

        // Show dollar bill near customer
        function showDollarBill(customer) {
            try {
                var dollarCube = document.getElementById('dollar-cube');
                if (dollarCube) {
                    var cpos = customer.getAttribute('position');
                    var px = 0, py = 1.2, pz = 0;
                    if (cpos) {
                        px = (cpos.x !== undefined) ? cpos.x : 0;
                        py = ((cpos.y !== undefined) ? cpos.y : 0) + 1.2;
                        pz = ((cpos.z !== undefined) ? cpos.z : 0) + 0.5;
                    }
                    dollarCube.setAttribute('position', px + ' ' + py + ' ' + pz);
                    dollarCube.setAttribute('visible', 'true');
                    dollarCube._collected = false; // Reset so it can be collected again
                    if (spawnedObjects.indexOf(dollarCube) === -1) spawnedObjects.push(dollarCube);
                }
            } catch (e) { console.warn('dollar bill err:', e); }
        }

        function checkDollarCollection() {
            var dollars = [];
            document.querySelectorAll('.dollar-bill').forEach(function (el) { dollars.push(el); });
            if (dollars.length === 0) return;

            var registers = [];
            spawnedObjects.forEach(function (obj) {
                var model = obj.getAttribute('gltf-model');
                if (model && model.includes('Cashregister')) registers.push(obj);
            });
            if (registers.length === 0) return;

            dollars.forEach(function (dollar) {
                if (!dollar.object3D) return;
                if (dollar._collected) return;
                if (dollar.getAttribute('visible') === 'false') return;
                var dPos = new THREE.Vector3();
                dollar.object3D.getWorldPosition(dPos);

                registers.forEach(function (reg) {
                    if (dollar._collected) return;
                    if (!reg.object3D) return;
                    var rPos = new THREE.Vector3();
                    reg.object3D.getWorldPosition(rPos);

                    if (dPos.distanceTo(rPos) < 0.4) {
                        dollar._collected = true;
                        // Money sound
                        try {
                            var moneySfx = new Audio('sounds/money.mp3');
                            moneySfx.volume = 0.8;
                            moneySfx.play();
                        } catch (e) { }

                        // Hide dollar
                        dollar.setAttribute('visible', 'false');
                        dollar.setAttribute('position', '0 -50 0');

                        // GAME MODE: customer done, advance queue
                        if (gameMode) {
                            billCollected = true;
                            var earned = coffeesOrdered * 5;
                            totalServed++;
                            totalEarnings += earned;
                            updateTutorialUI();
                            showARNotification('+$' + earned + ' | Total: $' + totalEarnings + ' | Clients: ' + totalServed, 2500);

                            // Remove current customer, advance queue
                            var served = customerQueue.shift();
                            removeCustomerClean(served);
                            setTimeout(function () {
                                advanceQueue();
                            }, 2000);
                            return;
                        }

                        // TUTORIAL MODE
                        if (tutorialStep === 6) {
                            tutorialStep = 7;
                            updateTutorialUI();
                            showARNotification('Money collected! Tutorial complete!', 4000);
                        }
                        if (customers.length > 0) {
                            removeCustomer(customers[0]);
                        }
                    }
                });
            });
        }

        // --- GLOBAL POLLING LOOP ---
        setInterval(function () {
            checkTrashcanCollisions();
            checkDollarCollection();
            // Tutorial: ensure customer present at step 5
            if ((!gameMode) && tutorialStep === 5 && customers.length === 0) {
                if (Math.random() < 0.05) spawnCustomer();
            }
        }, 50);

        function checkCoffeeDelivery() {
            // In game mode, only check activeCustomer
            var checkTargets = [];
            if (gameMode) {
                if (activeCustomer && !activeCustomer._delivered) checkTargets.push(activeCustomer);
            } else {
                // Tutorial mode: check customers array
                for (var ci = 0; ci < customers.length; ci++) {
                    if (!customers[ci]._delivered) checkTargets.push(customers[ci]);
                }
            }
            if (checkTargets.length === 0) return;

            for (var t = 0; t < checkTargets.length; t++) {
                var customer = checkTargets[t];
                if (!customer.object3D) continue;

                var custPos = new THREE.Vector3();
                customer.object3D.getWorldPosition(custPos);

                var closestDist = 999;

                for (var i = spawnedObjects.length - 1; i >= 0; i--) {
                    var obj = spawnedObjects[i];
                    if (!obj || !obj.object3D) continue;

                    var isCoffee =
                        (obj.classList && obj.classList.contains('coffee-cup')) ||
                        (obj.dataset && obj.dataset.isCoffee === 'true') ||
                        (obj.id && obj.id.includes('coffee-cup'));

                    if (!isCoffee) continue;

                    var cupPos = new THREE.Vector3();
                    obj.object3D.getWorldPosition(cupPos);

                    var distXZ = Math.sqrt(
                        Math.pow(custPos.x - cupPos.x, 2) +
                        Math.pow(custPos.z - cupPos.z, 2)
                    );

                    if (distXZ < closestDist) closestDist = distXZ;

                    var heightDiff = Math.abs(cupPos.y - custPos.y);

                    if (distXZ < 0.6 && heightDiff < 2.0) {
                        deliverCoffee(customer, obj);
                        return;
                    }
                }

                if (debugEl && closestDist < 10 && !deliveryDebugLock) {
                    debugEl.textContent = 'Dist: ' + closestDist.toFixed(2) + 'm (Need < 0.6)';
                    if (closestDist < 0.6) debugEl.style.color = 'lime';
                    else debugEl.style.color = 'yellow';
                }
            }
        }
    }, 100);
});
