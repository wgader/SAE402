# 🏗️ Architecture Technique - Coffee Quest AR

Ce document détaille l'organisation technique, les choix technologiques et les processus de collaboration pour le projet de Réalité Mixte Coffee Quest.

## 🛠️ Stack Technique

- **Moteur 3D/XR** : A-Frame (Framework basé sur Three.js)
- **Build Tool & Serveur Dev** : Vite (Hot Module Replacement, gestion modules ES6)
- **Langage** : JavaScript (ES6 Modules)
- **Format 3D** : `.glb` (glTF Binary, compressé via Blender)
- **Test Mobile** : Ngrok (Tunneling HTTPS pour accès capteurs XR)

## 📂 Structure du Projet

Nous suivons une architecture modulaire pour séparer la logique (JS), la vue (HTML) et les ressources (Assets).

```
coffee-quest-ar/
├── public/                  # 📦 RESSOURCES STATIQUES (Accessibles via /)
│   ├── models/              # Fichiers 3D (.glb uniquement)
│   │   ├── machine.glb
│   │   ├── tasse.glb
│   │   └── decor/
│   ├── sounds/              # Effets sonores (.mp3/.wav)
│   └── icons/               # Assets 2D pour l'UI
│
├── src/                     # 🧠 CODE SOURCE LOGIQUE
│   ├── components/          # COMPOSANTS A-FRAME (Comportements)
│   │   ├── ar-hit-test.js   # Gestion du curseur et placement
│   │   ├── coffee-machine.js# Logique de la machine (click, timer)
│   │   ├── customer.js      # IA des clients
│   │   └── draggable.js     # Physique pour attraper les objets
│   │
│   ├── systems/             # SYSTÈMES GLOBAUX (Managers)
│   │   └── game-manager.js  # Score, Argent, État du jeu (Menu/Jeu)
│   │
│   ├── styles/              # CSS
│   │   └── overlay.css      # Style pour l'interface 2D (HTML Overlay)
│   │
│   └── main.js              # Point d'entrée (Imports des composants)
│
├── index.html               # 🎬 SCÈNE PRINCIPALE (Entités & Lumières)
├── package.json             # Dépendances NPM
└── .gitignore               # Fichiers ignorés (node_modules, .env)
```

## 🧩 Pattern de Conception : ECS (Entity-Component-System)

A-Frame fonctionne sur le principe ECS. On code par composition, pas en "Orienté Objet" classique.

### 1. Entity (L'objet vide)
Conteneur vide dans le HTML.  
Exemple : `<a-entity id="ma-tasse"></a-entity>`

### 2. Component (Le comportement)
Script JS qui donne une capacité à une entité.  
Exemple : composant remplissable  
Utilisation : `<a-entity remplissable="liquide: cafe"></a-entity>`

### 3. System (Le chef d'orchestre)
Gère les données globales.  
Exemple : le game-manager qui compte l'argent total, peu importe combien de tasses sont vendues.

---

echo "Quelle est votre question ou besoin ?"
