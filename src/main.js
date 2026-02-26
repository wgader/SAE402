import 'aframe';

import 'aframe-extras';
import 'aframe-physics-system';

// Import new architecture modules
import './systems/game-manager.js';
import './components/coffee-machine.js';
import './components/sink.js';
import './components/ar-hit-test.js';
import './components/draggable.js';
import './components/customer.js';

// Component: make entity face camera on Y axis only
AFRAME.registerComponent('face-camera', {
    tick: function () {
        var camera = this.el.sceneEl.camera;
        if (!camera) return;
        var camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        var elPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(elPos);
        var angle = Math.atan2(camPos.x - elPos.x, camPos.z - elPos.z);
        this.el.object3D.rotation.y = angle;
    }
});

console.log('☕ SAE 402 - Chargement...');

function initGame() {
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

        // Grab state — per-hand for dual grab
        var grabs = {}; // key: controller id, value: { controller, el, velocities }
        var grabIdCounter = 0;
        const surfaces = [];
        const spawnedObjects = [];

        // Globally expose for components
        window.registerSpawnedObject = function (el) {
            spawnedObjects.push(el);
            if (el.classList && el.classList.contains('trashcan') && typeof trashcans !== 'undefined') {
                trashcans.push(el);
            }
        };

        // Legacy aliases for code that still reads these
        let grabbed = false;
        let grabController = null;
        let currentGrabbedEl = null;
        let velocities = [];

        let menuToggleLock = false; // Prevents flickering when holding button
        let coffeeMachineLock = false; // Prevents multiple coffee spawns
        let sinkLock = false; // Prevents multiple glass spawns
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

        // --- EVENT SCHEDULER STATE ---
        var gameEventTimer = null;       // Timer for next event
        var patienceTimers = [];         // Active patience intervals
        const PATIENCE_DURATION_MIN = 15000;  // 15s min patience
        const PATIENCE_DURATION_MAX = 25000;  // 25s max patience
        const PATIENCE_PENALTY = 5;           // $5 penalty for angry customer

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

        // --- COMPONENTS MOVED TO src/components/ ---
        // Coffee Machine and Sink logic is now handled by A-Frame components.


        // --- TRASHCAN DELETION SYSTEM ---
        const trashcans = []; // Liste des poubelles dans la scène
        const TRASH_RADIUS = 0.4; // Rayon de détection élargi (0.2 -> 0.4)
        let giveCoffeeLock = false; // Lock pour donner le café
        var bgMusic = null; // Musique de fond

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
            title.setAttribute('position', '-0.25 0.55 0.03');
            title.setAttribute('width', '3.5');
            title.setAttribute('color', '#ffffff');
            title.setAttribute('font', 'mozillavr');
            title.setAttribute('letter-spacing', '2');
            menu.appendChild(title);

            // Wallet balance display
            const walletText = document.createElement('a-text');
            walletText.setAttribute('value', '$' + totalEarnings);
            walletText.setAttribute('align', 'center');
            walletText.setAttribute('position', '0.45 0.55 0.03');
            walletText.setAttribute('width', '3');
            walletText.setAttribute('color', '#00b894');
            walletText.setAttribute('font', 'mozillavr');
            walletText.id = 'shop-wallet';
            menu.appendChild(walletText);

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
                // Row 1: Essentials (FREE)
                { type: 'gltf', model: 'models/CoffeeMachine.glb', color: '#fab1a0', label: 'COFFEE', menuScale: '0.2 0.2 0.2', spawnScale: '0.4 0.4 0.4', price: 0 },
                { type: 'gltf', model: 'models/TrashcanSmall.glb', color: '#a29bfe', label: 'TRASH', menuScale: '0.2 0.2 0.2', spawnScale: '0.8 0.8 0.8', price: 0 },
                // Row 2: Tools + Register (FREE)
                { type: 'gltf', label: 'SPEAKER', model: 'models/BassSpeakers.glb', color: '#fff', menuScale: '0.1 0.1 0.1', spawnScale: '0.8 0.8 0.8', price: 20 },
                { type: 'gltf', label: 'BROOM', model: 'models/Broom.glb', color: '#fff', menuScale: '0.001 0.001 0.001', spawnScale: '0.004 0.004 0.004', price: 0 },
                { type: 'gltf', label: 'REGISTER', model: 'models/Cashregister.glb', color: '#fff', menuScale: '0.007 0.007 0.007', spawnScale: '0.03 0.03 0.03', price: 0 },
                { type: 'gltf', label: 'DUSTPAN', model: 'models/DustPan.glb', color: '#fff', menuScale: '0.08 0.08 0.08', spawnScale: '0.25 0.25 0.25', price: 0 },
                { type: 'gltf', label: 'SINK', model: 'models/Sink.glb', color: '#74b9ff', menuScale: '0.06 0.06 0.06', spawnScale: '0.5 0.5 0.5', price: 0 },
                // Row 3: Decoration (PAID)
                { type: 'gltf', label: 'SIGN', model: 'models/Coffeesign.glb', color: '#fff', menuScale: '0.04 0.04 0.04', spawnScale: '0.2 0.2 0.2', price: 15 },
                { type: 'gltf', label: 'COUCH', model: 'models/Couch.glb', color: '#fff', menuScale: '0.08 0.08 0.08', spawnScale: '0.3 0.3 0.3', price: 30 },
                { type: 'gltf', label: 'PLANT', model: 'models/Houseplant.glb', color: '#fff', menuScale: '0.1 0.1 0.1', spawnScale: '0.4 0.4 0.4', price: 10 },
                { type: 'gltf', label: 'RUG', model: 'models/Rug.glb', color: '#fff', menuScale: '0.05 0.05 0.05', spawnScale: '0.4 0.4 0.4', price: 10 }
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
                btn.dataset.spawnPrice = item.price.toString();
                if (item.model) btn.dataset.spawnModel = item.model;
                if (item.spawnScale) btn.dataset.spawnScale = item.spawnScale;

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
                label.setAttribute('position', '0 -0.09 0.06');
                label.setAttribute('width', '1.4');
                label.setAttribute('color', '#dfe6e9');
                btnGroup.appendChild(label);

                // PRICE TAG
                const priceTag = document.createElement('a-text');
                priceTag.setAttribute('value', item.price === 0 ? 'FREE' : '$' + item.price);
                priceTag.setAttribute('align', 'center');
                priceTag.setAttribute('position', '0 -0.14 0.06');
                priceTag.setAttribute('width', '1.2');
                priceTag.setAttribute('color', item.price === 0 ? '#00b894' : '#fdcb6e');
                priceTag.setAttribute('font', 'mozillavr');
                btnGroup.appendChild(priceTag);

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

                    // ATTACH ECS COMPONENTS
                    if (model && model.includes('CoffeeMachine')) entity.setAttribute('coffee-machine', '');
                    if (model && model.includes('Sink')) entity.setAttribute('sink', '');

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
                    ctrl0.addEventListener('selectend', () => release(ctrl0));
                    ctrl1.addEventListener('selectstart', () => grab(ctrl1));
                    ctrl1.addEventListener('selectend', () => release(ctrl1));

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
                                    // Update wallet balance when opening shop
                                    if (!vis) {
                                        var walletEl = document.getElementById('shop-wallet');
                                        if (walletEl) walletEl.setAttribute('value', '$' + totalEarnings);
                                    }
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

                    // RIGHT CONTROLLER - Button B = Coffee Machine / Sink Interaction
                    if (source.handedness === 'right' && source.gamepad) {
                        // Button 5 is usually 'B' on Quest, also try button 4 (A)
                        const bBtn = source.gamepad.buttons[5];
                        const aBtn2 = source.gamepad.buttons[4];
                        const interactBtn = (bBtn && bBtn.pressed) ? bBtn : ((aBtn2 && aBtn2.pressed) ? aBtn2 : null);

                        if (interactBtn && interactBtn.pressed && !coffeeMachineLock && !sinkLock) {
                            // Raycast from right controller to detect coffee machine or sink
                            const rightCtrl = window.rightController;
                            if (rightCtrl) {
                                const tempMatrix = new THREE.Matrix4();
                                tempMatrix.identity().extractRotation(rightCtrl.matrixWorld);

                                const raycaster = new THREE.Raycaster();
                                raycaster.ray.origin.setFromMatrixPosition(rightCtrl.matrixWorld);
                                raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
                                raycaster.far = 5.0;

                                // Find all coffee machines AND sinks
                                const interactables = [];
                                spawnedObjects.forEach(obj => {
                                    if (obj && obj.object3D) {
                                        const model = obj.getAttribute('gltf-model');
                                        if (model && (model.includes('CoffeeMachine') || model.includes('Sink'))) {
                                            obj.object3D.traverse(child => {
                                                if (child.isMesh) {
                                                    child.el = obj;
                                                    interactables.push(child);
                                                }
                                            });
                                        }
                                    }
                                });

                                console.log('🔍 B pressed: interactables found:', interactables.length);

                                const intersects = raycaster.intersectObjects(interactables);

                                if (intersects.length > 0) {
                                    const hitEntity = intersects[0].object.el;
                                    if (hitEntity) {
                                        const hitModel = hitEntity.getAttribute('gltf-model');
                                        console.log('🎯 Hit:', hitModel);
                                        // TRIGGER ECS COMPONENT EVENT
                                        hitEntity.emit('interact');

                                    }
                                } else {
                                    // FALLBACK: proximity check if raycast missed
                                    const ctrlPos = new THREE.Vector3();
                                    rightCtrl.getWorldPosition(ctrlPos);
                                    var closestMachine = null;
                                    var closestDist = 2.0; // 2m proximity
                                    spawnedObjects.forEach(obj => {
                                        if (obj && obj.object3D) {
                                            const model = obj.getAttribute('gltf-model');
                                            if (model && (model.includes('CoffeeMachine') || model.includes('Sink'))) {
                                                const objPos = new THREE.Vector3();
                                                obj.object3D.getWorldPosition(objPos);
                                                const d = ctrlPos.distanceTo(objPos);
                                                if (d < closestDist) {
                                                    closestDist = d;
                                                    closestMachine = obj;
                                                }
                                            }
                                        }
                                    });
                                    if (closestMachine) {
                                        const hitModel = closestMachine.getAttribute('gltf-model');
                                        console.log('📍 Proximity hit:', hitModel, 'dist:', closestDist.toFixed(2));
                                        // TRIGGER ECS COMPONENT EVENT
                                        closestMachine.emit('interact');

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
                            var price = parseInt(el.dataset.spawnPrice) || 0;

                            // CHECK FUNDS
                            if (price > 0 && totalEarnings < price) {
                                showARNotification('Not enough money! Need $' + price + ' (Have $' + totalEarnings + ')', 2500);
                                el.setAttribute('color', '#d63031'); // Red flash
                                setTimeout(function () { el.setAttribute('color', '#2d3436'); }, 500);
                            } else {
                                // DEDUCT MONEY
                                if (price > 0) {
                                    totalEarnings -= price;
                                    showARNotification('-$' + price + ' | Wallet: $' + totalEarnings, 2000);
                                }
                                // Update wallet display in shop
                                var walletEl = document.getElementById('shop-wallet');
                                if (walletEl) walletEl.setAttribute('value', '$' + totalEarnings);
                                updateTutorialUI();

                                el.setAttribute('color', '#00cec9');

                                // FORCE RELEASE to prevent "Head Tracking" glitch
                                if (window.grabbed) {
                                    release();
                                }

                                spawnObject(el.dataset.spawnType, el.dataset.spawnColor, el.dataset.spawnModel, el.dataset.spawnScale);
                            }
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

            // All grabbed objects follow their controllers
            var grabKeys = Object.keys(grabs);
            for (var gi = 0; gi < grabKeys.length; gi++) {
                var g = grabs[grabKeys[gi]];
                if (!g || !g.controller || !g.el) continue;
                try {
                    const pos = new THREE.Vector3();
                    g.controller.getWorldPosition(pos);

                    if (isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
                        g.el.object3D.position.set(pos.x, pos.y, pos.z);

                        // SPECIAL CASE: BROOM OFFSET
                        const model = g.el.getAttribute('gltf-model');
                        if (model && model.includes('Broom')) {
                            g.el.object3D.translateY(-0.6);
                        }

                        if (g.el.body) {
                            const p = g.el.object3D.position;
                            g.el.body.position.set(p.x, p.y, p.z);
                        }

                        g.velocities.push({ x: pos.x, y: pos.y, z: pos.z, t: performance.now() });
                        if (g.velocities.length > 10) g.velocities.shift();
                    }
                } catch (e) { }
            }
            // Update legacy aliases for compatibility
            var firstKey = grabKeys.length > 0 ? grabKeys[0] : null;
            if (firstKey && grabs[firstKey]) {
                grabbed = true;
                grabController = grabs[firstKey].controller;
                currentGrabbedEl = grabs[firstKey].el;
            } else {
                grabbed = false;
                grabController = null;
                currentGrabbedEl = null;
            }
        }

        // Removed release/grab duplicated definitions if any, used the ones already defined above if valid scopes?
        // Wait, 'grab' and 'release' were defined outside loop in previous version?
        // Let's ensure they are available. In the original file they were inside window.load but outside loop.
        // I am replacing from line 41 to 609, so I am including them.

        function grab(controller) {
            // Check if this controller already grabs something
            var ctrlId = controller.uuid || controller.id || ('ctrl' + (grabIdCounter++));
            if (!controller._grabId) controller._grabId = ctrlId;
            ctrlId = controller._grabId;
            if (grabs[ctrlId]) return; // Already grabbing

            // Get controller position
            const ctrlPos = new THREE.Vector3();
            controller.getWorldPosition(ctrlPos);

            // Find the closest grabbable object not already grabbed by another hand
            var alreadyGrabbed = {};
            var gKeys = Object.keys(grabs);
            for (var i = 0; i < gKeys.length; i++) {
                if (grabs[gKeys[i]] && grabs[gKeys[i]].el) alreadyGrabbed[grabs[gKeys[i]].el.id] = true;
            }

            const allGrabbables = [cubeEl, ...spawnedObjects];
            let closestEl = null;
            let closestDist = 0.5;

            allGrabbables.forEach(el => {
                if (!el || !el.object3D) return;
                if (alreadyGrabbed[el.id]) return; // Already held by other hand
                const objPos = new THREE.Vector3();
                el.object3D.getWorldPosition(objPos);
                const dist = ctrlPos.distanceTo(objPos);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestEl = el;
                }
            });

            if (!closestEl) return;

            if (debugEl) debugEl.textContent = 'GRAB!';

            closestEl._originalColor = closestEl.getAttribute('color');
            closestEl.setAttribute('color', '#FFD700');

            if (closestEl.body) {
                closestEl.body.mass = 0;
                closestEl.body.type = 2;
                closestEl.body.collisionResponse = false;
                closestEl.body.updateMassProperties();
            }

            grabs[ctrlId] = { controller: controller, el: closestEl, velocities: [] };
        }

        function release(controller) {
            var ctrlId = controller._grabId;
            if (!ctrlId || !grabs[ctrlId]) return;
            var g = grabs[ctrlId];
            var el = g.el;

            let vx = 0, vy = 0, vz = 0;
            if (g.velocities.length >= 2) {
                const l = g.velocities[g.velocities.length - 1];
                const f = g.velocities[0];
                const dt = (l.t - f.t) / 1000;
                if (dt > 0.01) {
                    vx = (l.x - f.x) / dt;
                    vy = (l.y - f.y) / dt;
                    vz = (l.z - f.z) / dt;
                }
            }

            const originalColor = el._originalColor || '#8A2BE2';
            el.setAttribute('color', originalColor);

            if (el.body) {
                const p = el.object3D.position;
                el.body.position.set(p.x, p.y, p.z);
                el.body.type = 1;
                el.body.collisionResponse = true;
                el.body.mass = 0.3;
                el.body.updateMassProperties();
                el.body.velocity.set(vx, vy, vz);
                el.body.wakeUp();
            }

            delete grabs[ctrlId];
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
                        try { var broomCleanSfx = new Audio('sounds/broom.mp3'); broomCleanSfx.volume = 0.6; broomCleanSfx.play(); } catch (e) { }
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

        // Get queue position based on camera direction
        // Queue extends AWAY from camera through SERVICE_POS
        function getQueuePosition(queueIndex) {
            var cam = sceneEl.camera;
            var cx = 0, cz = 0;
            if (cam) {
                var camPos = new THREE.Vector3();
                cam.getWorldPosition(camPos);
                cx = camPos.x;
                cz = camPos.z;
            }
            // Direction from camera to service position
            var dx = SERVICE_POS.x - cx;
            var dz = SERVICE_POS.z - cz;
            var len = Math.sqrt(dx * dx + dz * dz);
            if (len < 0.01) { dx = 0; dz = -1; len = 1; } // fallback
            dx /= len;
            dz /= len;
            // Service position = index 0, queue extends further along this direction
            var dist = QUEUE_SPACING * (queueIndex + 1);
            return {
                x: SERVICE_POS.x + dx * dist,
                z: SERVICE_POS.z + dz * dist
            };
        }

        // Create a single customer entity
        function createCustomer(queueIndex) {
            // All Poly Pizza character models (same scale/animations)
            var customerModels = [
                'models/Punk.glb',
                'models/Adventurer.glb',
                'models/BeachCharacter.glb',
                'models/BusinessMan.glb',
                'models/CasualCharacter.glb',
                'models/DressWoman.glb',
                'models/HoodieCharacter.glb',
                'models/PantWoman.glb',
                'models/SuitWoman.glb',
                'models/Worker.glb'
            ];
            var randomModel = customerModels[Math.floor(Math.random() * customerModels.length)];
            var numCoffees = Math.floor(Math.random() * 2) + 1; // 1-2 items total

            // Randomize each item: coffee or water
            var orderTypes = [];
            var coffeeCount = 0;
            var waterCount = 0;
            for (var oi = 0; oi < numCoffees; oi++) {
                if (Math.random() < 0.6) {
                    orderTypes.push('coffee');
                    coffeeCount++;
                } else {
                    orderTypes.push('water');
                    waterCount++;
                }
            }

            var customer = document.createElement('a-entity');
            customer.setAttribute('gltf-model', 'url(' + randomModel + ')');
            var qPos = getQueuePosition(queueIndex);
            customer.setAttribute('position', qPos.x + ' 0 ' + qPos.z);
            customer.setAttribute('scale', '1 1 1');
            customer.setAttribute('rotation', '0 0 0');
            customer.classList.add('customer');
            customer.id = 'customer-' + Date.now() + '-' + queueIndex;
            customer._posY = 0;

            // Start with Idle animation (Walk only during movement)
            customer.setAttribute('animation-mixer', 'clip: *Idle; loop: repeat');

            // Make customer face the camera
            customer.setAttribute('face-camera', '');

            // Comic speech bubble above head
            var bubble = document.createElement('a-entity');
            bubble.setAttribute('position', '0 2.5 0.3');

            // Build order message
            var orderParts = [];
            if (coffeeCount > 0) orderParts.push(coffeeCount + ' Coffee' + (coffeeCount > 1 ? 's' : ''));
            if (waterCount > 0) orderParts.push(waterCount + ' Water');
            var orderMsg = orderParts.join(' + ') + '!';
            var bubbleW = Math.max(1.0, orderMsg.length * 0.1 + 0.4);
            var bg = document.createElement('a-plane');
            bg.setAttribute('width', '' + bubbleW);
            bg.setAttribute('height', '0.4');
            bg.setAttribute('color', '#FFFFFF');
            bg.setAttribute('material', 'shader: flat; opacity: 0.95');
            bubble.appendChild(bg);

            // Bubble tail (small triangle pointing down)
            var tail = document.createElement('a-triangle');
            tail.setAttribute('vertex-a', '0.1 -0.2 0');
            tail.setAttribute('vertex-b', '-0.1 -0.2 0');
            tail.setAttribute('vertex-c', '0 -0.38 0');
            tail.setAttribute('color', '#FFFFFF');
            tail.setAttribute('material', 'shader: flat; side: double');
            bubble.appendChild(tail);

            // Order text inside bubble
            var text = document.createElement('a-text');
            text.setAttribute('value', orderMsg);
            text.setAttribute('align', 'center');
            text.setAttribute('position', '0 0.05 0.01');
            text.setAttribute('scale', '0.8 0.8 0.8');
            text.setAttribute('color', '#333333');
            text.setAttribute('font', 'mozillavr');
            bubble.appendChild(text);

            customer.appendChild(bubble);
            customer._orderText = text;
            customer._bubbleBg = bg;
            customer._bubble = bubble;

            // Green circle on floor
            var circle = document.createElement('a-ring');
            circle.setAttribute('radius-inner', '0.4');
            circle.setAttribute('radius-outer', '0.5');
            circle.setAttribute('color', '#00ff00');
            circle.setAttribute('rotation', '-90 0 0');
            circle.setAttribute('position', '0 0.02 0');
            circle.setAttribute('visible', 'false');
            customer.appendChild(circle);
            customer._circle = circle;

            // Patience bar (above bubble, hidden until active)
            var patienceBar = document.createElement('a-plane');
            patienceBar.setAttribute('width', '1.0');
            patienceBar.setAttribute('height', '0.08');
            patienceBar.setAttribute('color', '#00cc00');
            patienceBar.setAttribute('material', 'shader: flat');
            patienceBar.setAttribute('position', '0 2.95 0.3');
            patienceBar.setAttribute('visible', 'false');
            customer.appendChild(patienceBar);

            // Patience bar background (dark)
            var patienceBg = document.createElement('a-plane');
            patienceBg.setAttribute('width', '1.04');
            patienceBg.setAttribute('height', '0.12');
            patienceBg.setAttribute('color', '#333333');
            patienceBg.setAttribute('material', 'shader: flat');
            patienceBg.setAttribute('position', '0 2.95 0.29');
            patienceBg.setAttribute('visible', 'false');
            customer.appendChild(patienceBg);

            customer._coffees = numCoffees;
            customer._orderTypes = orderTypes; // ['coffee', 'water', ...]
            customer._delivered = false;
            customer._queueIndex = queueIndex;
            customer._patience = 100;
            customer._maxPatienceDuration = PATIENCE_DURATION_MIN + Math.random() * (PATIENCE_DURATION_MAX - PATIENCE_DURATION_MIN);
            customer._patienceActive = false;
            customer._patienceBar = patienceBar;
            customer._patienceBg = patienceBg;
            customer._patienceTimer = null;

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
            customer._orderText.setAttribute('value', '1 Coffee!');
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
                scheduleNextEvent(3000); // First event after 3s
            } catch (e) {
                if (debugEl) debugEl.textContent = 'GAME START ERR: ' + e.message;
                console.error('startGameMode error:', e);
            }
        }

        // --- EVENT SCHEDULER ---
        function scheduleNextEvent(delay) {
            if (!gameMode) return;
            if (gameEventTimer) clearTimeout(gameEventTimer);
            var d = delay || (10000 + Math.random() * 15000); // 10-25s between events
            gameEventTimer = setTimeout(function () {
                if (!gameMode) return;
                triggerRandomEvent();
            }, d);
        }

        function triggerRandomEvent() {
            var roll = Math.random();
            if (roll < 0.15) {
                // 15%: calm period — nothing happens, just schedule next
                scheduleNextEvent();
                return;
            } else if (roll < 0.55) {
                // 40%: 1-2 customers arrive one by one
                var count = Math.floor(Math.random() * 2) + 1;
                spawnCustomersGradually(count, 0);
            } else if (roll < 0.80) {
                // 25%: 1-2 stains appear
                var numStains = Math.floor(Math.random() * 2) + 1;
                for (var s = 0; s < numStains; s++) spawnRandomStain();
                showARNotification('Coffee spill! Clean it up!', 3000);
                try { var broomSfx = new Audio('sounds/broom.mp3'); broomSfx.volume = 0.5; broomSfx.play(); } catch (e) { }
                scheduleNextEvent(); // Schedule next event
            } else {
                // 20%: rush — 3-4 customers arrive fast
                var rushCount = Math.floor(Math.random() * 2) + 3;
                showARNotification('RUSH HOUR! ' + rushCount + ' customers incoming!', 3000);
                spawnCustomersGradually(rushCount, 0);
            }
        }

        // Spawn customers one by one with delays
        function spawnCustomersGradually(remaining, index) {
            if (!gameMode || remaining <= 0) {
                scheduleNextEvent(); // Schedule next event after all spawned
                return;
            }
            // Cap queue at 4 customers max
            if (customerQueue.length >= 4) {
                scheduleNextEvent();
                return;
            }
            var queuePos = customerQueue.length;
            var c = createCustomer(queuePos);
            customerQueue.push(c);

            // If no active customer, advance the queue
            if (!activeCustomer) {
                advanceQueue();
            } else {
                // Walk new customer to their queue position
                var qPos = getQueuePosition(queuePos - 1);
                var dest = qPos.x + ' 0 ' + qPos.z;
                walkCustomerTo(c, dest, 2500, null);
            }

            if (debugEl) debugEl.textContent = 'Queue: ' + customerQueue.length + ' customers';

            // Spawn next customer after 3-5s delay
            if (remaining > 1) {
                var nextDelay = 3000 + Math.random() * 2000;
                setTimeout(function () {
                    spawnCustomersGradually(remaining - 1, index + 1);
                }, nextDelay);
            } else {
                scheduleNextEvent(); // All spawned, schedule next event
            }
        }

        // --- PATIENCE SYSTEM ---
        function startPatienceTimer(customer) {
            if (!customer || customer._patienceActive) return;
            customer._patienceActive = true;
            customer._patience = 100;

            // Show patience bar
            if (customer._patienceBar) customer._patienceBar.setAttribute('visible', 'true');
            if (customer._patienceBg) customer._patienceBg.setAttribute('visible', 'true');

            var tickRate = 200; // Update every 200ms
            var decrementPerTick = (100 / (customer._maxPatienceDuration / tickRate));

            customer._patienceTimer = setInterval(function () {
                if (!customer || !customer.parentNode) {
                    stopPatienceTimer(customer);
                    return;
                }
                customer._patience -= decrementPerTick;
                if (customer._patience < 0) customer._patience = 0;

                // Update bar width and color
                var pct = customer._patience / 100;
                var barWidth = pct * 1.0;
                if (customer._patienceBar) {
                    customer._patienceBar.setAttribute('width', '' + Math.max(0.01, barWidth));
                    // Green → Yellow → Red
                    var r = Math.min(255, Math.floor(510 * (1 - pct)));
                    var g = Math.min(255, Math.floor(510 * pct));
                    var color = '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + '00';
                    customer._patienceBar.setAttribute('color', color);
                }

                // Out of patience!
                if (customer._patience <= 0) {
                    customerLeaveAngry(customer);
                }
            }, tickRate);
        }

        function stopPatienceTimer(customer) {
            if (!customer) return;
            customer._patienceActive = false;
            if (customer._patienceTimer) {
                clearInterval(customer._patienceTimer);
                customer._patienceTimer = null;
            }
            if (customer._patienceBar) customer._patienceBar.setAttribute('visible', 'false');
            if (customer._patienceBg) customer._patienceBg.setAttribute('visible', 'false');
        }

        function customerLeaveAngry(customer) {
            stopPatienceTimer(customer);

            // Play angry sound
            try { var angrySfx = new Audio('sounds/angry.mp3'); angrySfx.volume = 0.8; angrySfx.play(); } catch (e) { }

            // Penalty
            totalEarnings = Math.max(0, totalEarnings - PATIENCE_PENALTY);
            showARNotification('Customer left angry! -$' + PATIENCE_PENALTY, 3000);

            // Update bubble text angrily
            if (customer._orderText) customer._orderText.setAttribute('value', 'Too slow!');
            if (customer._bubbleBg) customer._bubbleBg.setAttribute('color', '#FF4444');

            // Walk customer away to the SIDE then away (not through queue)
            var cam = sceneEl.camera;
            var awayX = 0, awayZ = -5;
            if (cam) {
                var camPos = new THREE.Vector3();
                cam.getWorldPosition(camPos);
                var cpos = customer.getAttribute('position');
                var cx = cpos ? cpos.x : 0;
                var cz = cpos ? cpos.z : 0;
                // Direction away from camera
                var dx = cx - camPos.x;
                var dz = cz - camPos.z;
                var len = Math.sqrt(dx * dx + dz * dz);
                if (len > 0.01) { dx /= len; dz /= len; }
                else { dx = 0; dz = -1; }
                // Add perpendicular offset to the side (right side)
                var sideX = -dz * 2; // perpendicular
                var sideZ = dx * 2;
                awayX = cx + dx * 4 + sideX;
                awayZ = cz + dz * 4 + sideZ;
            }

            // Remove from queue
            var idx = customerQueue.indexOf(customer);
            if (idx > -1) customerQueue.splice(idx, 1);

            if (customer === activeCustomer) {
                activeCustomer = null;
                coffeesOrdered = 0;
                coffeesDelivered = 0;
                billCollected = false;
            }

            // Remove face-camera and rotate customer to face AWAY from player
            customer.removeAttribute('face-camera');
            var cpos2 = customer.getAttribute('position');
            var cx2 = cpos2 ? cpos2.x : 0;
            var cz2 = cpos2 ? cpos2.z : 0;
            var awayAngle = Math.atan2(awayX - cx2, awayZ - cz2) * (180 / Math.PI);
            customer.setAttribute('rotation', '0 ' + awayAngle + ' 0');

            walkCustomerTo(customer, awayX + ' 0 ' + awayZ, 2000, function () {
                removeCustomerClean(customer);
                // Advance queue if there are more customers
                if (customerQueue.length > 0 && !activeCustomer) {
                    advanceQueue();
                }
                updateTutorialUI();
            });
        }

        // Helper: walk a customer to a target position with Walk animation
        function walkCustomerTo(customer, targetPos, duration, onDone) {
            // Switch to Walk animation
            customer.setAttribute('animation-mixer', 'clip: *Walk; loop: repeat');

            // Move position
            customer.setAttribute('animation', {
                property: 'position',
                to: targetPos,
                dur: duration,
                easing: 'linear'
            });

            // When arrived: switch back to Idle
            setTimeout(function () {
                if (!customer || !customer.parentNode) return;
                customer.removeAttribute('animation');
                customer.setAttribute('animation-mixer', 'clip: *Idle; loop: repeat');
                if (onDone) onDone();
            }, duration + 100);
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
                    // No more customers — events will spawn more naturally
                    return;
                }

                activeCustomer = customerQueue[0];
                coffeesOrdered = activeCustomer._coffees;
                coffeesDelivered = 0;
                billCollected = false;
                activeCustomer._delivered = false;

                // Walk active customer to service position
                var posY = activeCustomer._posY || 0;
                var targetPos = SERVICE_POS.x + ' ' + posY + ' ' + SERVICE_POS.z;
                var ac = activeCustomer;
                walkCustomerTo(ac, targetPos, 2500, function () {
                    if (ac && ac._circle) ac._circle.setAttribute('visible', 'true');
                    // Start patience timer when customer arrives at service position
                    startPatienceTimer(ac);
                });

                // Walk remaining customers forward in queue
                for (var i = 1; i < customerQueue.length; i++) {
                    var cPosY = customerQueue[i]._posY || 0;
                    var qPos = getQueuePosition(i - 1);
                    var dest = qPos.x + ' ' + cPosY + ' ' + qPos.z;
                    walkCustomerTo(customerQueue[i], dest, 2500, null);
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
            stopPatienceTimer(customer); // Clean up patience timer
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

            // Determine delivered item type
            var deliveredType = 'coffee'; // default
            if (cupEl.dataset.isWater === 'true' || cupEl.classList.contains('water-glass')) {
                deliveredType = 'water';
            }

            // Game Mode: Validate item type
            if (gameMode && customer === activeCustomer) {
                // Initialize remaining types if needed
                if (!customer._remainingTypes && customer._orderTypes) {
                    customer._remainingTypes = [...customer._orderTypes];
                }

                if (customer._remainingTypes) {
                    var typeIdx = customer._remainingTypes.indexOf(deliveredType);
                    if (typeIdx === -1) {
                        // WRONG ITEM
                        showARNotification('Wrong item! I wanted ' + customer._remainingTypes.join(' & '), 3000);
                        // Still consume the object to avoid physics mess, but don't count it
                    } else {
                        // CORRECT ITEM
                        customer._remainingTypes.splice(typeIdx, 1);
                        coffeesDelivered++;
                    }
                } else {
                    // Fallback for safety
                    coffeesDelivered++;
                }
            } else if (!gameMode) {
                // Tutorial mode: just accept
                customer._delivered = true;
            }

            // Release grab (find which hand holds this cup)
            try {
                var gk = Object.keys(grabs);
                for (var gi = 0; gi < gk.length; gi++) {
                    if (grabs[gk[gi]] && grabs[gk[gi]].el === cupEl) {
                        delete grabs[gk[gi]];
                        break;
                    }
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

            // GAME MODE: track multi-item delivery
            if (gameMode && customer === activeCustomer) {
                var remaining = coffeesOrdered - coffeesDelivered;
                if (remaining > 0) {
                    // Build remaining order message from _remainingTypes
                    var remTypes = customer._remainingTypes || [];
                    var remCoffee = remTypes.filter(function (t) { return t === 'coffee'; }).length;
                    var remWater = remTypes.filter(function (t) { return t === 'water'; }).length;
                    var remParts = [];
                    if (remCoffee > 0) remParts.push(remCoffee + ' Coffee' + (remCoffee > 1 ? 's' : ''));
                    if (remWater > 0) remParts.push(remWater + ' Water');
                    var rmsg = remParts.join(' + ') + ' left';
                    showARNotification(rmsg, 2000);
                    customer._orderText.setAttribute('value', rmsg);
                    if (customer._bubbleBg) customer._bubbleBg.setAttribute('width', '' + Math.max(1.0, rmsg.length * 0.1 + 0.4));
                } else if (remaining === 0) {
                    // All coffees delivered! Show dollar bill
                    customer._delivered = true;
                    stopPatienceTimer(customer); // Stop patience — order complete
                    try { var completeSfx = new Audio('sounds/complete.mp3'); completeSfx.volume = 0.7; completeSfx.play(); } catch (e) { }
                    showDollarBill(customer);
                    showARNotification('Collect the bill!', 3000);
                    var tmsg = 'Here is your bill';
                    customer._orderText.setAttribute('value', tmsg);
                    if (customer._bubbleBg) customer._bubbleBg.setAttribute('width', '' + Math.max(1.0, tmsg.length * 0.1 + 0.4));
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

        // Show dollar bill near customer (always between customer and camera)
        function showDollarBill(customer) {
            try {
                var dollarCube = document.getElementById('dollar-cube');
                if (dollarCube) {
                    var cpos = customer.getAttribute('position');
                    var px = (cpos && cpos.x !== undefined) ? cpos.x : 0;
                    var cy = (cpos && cpos.y !== undefined) ? cpos.y : 0;
                    var pz = (cpos && cpos.z !== undefined) ? cpos.z : 0;

                    // Direction from customer towards camera
                    var cam = sceneEl.camera;
                    var dx = 0, dz = 1;
                    if (cam) {
                        var camPos = new THREE.Vector3();
                        cam.getWorldPosition(camPos);
                        dx = camPos.x - px;
                        dz = camPos.z - pz;
                        var len = Math.sqrt(dx * dx + dz * dz);
                        if (len > 0.01) { dx /= len; dz /= len; }
                        else { dx = 0; dz = 1; }
                    }

                    // Place bill 0.5 units in front of customer (towards player)
                    var bx = px + dx * 0.5;
                    var bz = pz + dz * 0.5;
                    var by = cy + 1.2;

                    dollarCube.setAttribute('position', bx + ' ' + by + ' ' + bz);
                    dollarCube.setAttribute('visible', 'true');
                    dollarCube._collected = false;
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

                    var isWater =
                        (obj.classList && obj.classList.contains('water-glass')) ||
                        (obj.dataset && obj.dataset.isWater === 'true') ||
                        (obj.id && obj.id.includes('glass'));

                    if (!isCoffee && !isWater) continue;

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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
