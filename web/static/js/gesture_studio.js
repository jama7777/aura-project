import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

/**
 * AURA Motion Forge — FBX to GLB Forge Studio
 * Refactored to support GLB export and refined animation cleaning.
 */
class GestureStudio {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();
        this.model = null;
        this.mixer = null;
        this.skeleton = null;

        // Animations
        this.animations = {};      // name -> THREE.AnimationAction
        this.animationClips = {};   // name -> THREE.AnimationClip (for duration info)
        this.currentAction = null;
        this.currentAnimName = 'idle';
        this.animSpeed = 1.0;

        // The FBX animation map (same as avatar.js)
        this.animationMap = {
            'idle': 'Catwalk Idle To Twist R.fbx',
            'happy': 'Happy.fbx',
            'dance': 'Hip Hop Dancing.fbx',
            'dance2': 'Hip Hop Dancing-2.fbx',
            'clap': 'Clapping.fbx',
            'jump': 'Jumping Down.fbx',
            'sad': 'Defeated.fbx',
            'pray': 'Praying.fbx',
            'crouch': 'Crouch To Stand.fbx',
            'hug': 'Sitting Laughing.fbx',
            'angry': 'Angry.fbx',
            'walk_turn': 'Catwalk Walk Turn 180 Tight.fbx',
            'jog': 'Jog In Circle.fbx',
            'greet': 'Standing Greeting.fbx',
            'fight': 'Standing Idle To Fight Idle.fbx',
            'talking': 'Talking.fbx',
            'taunt': 'Taunt.fbx'
        };

        // Emoji icons for each animation
        this.animIcons = {
            idle: '🚶', happy: '😄', dance: '💃', dance2: '🕺',
            clap: '👏', jump: '🦘', sad: '😞', pray: '🙏',
            crouch: '🧎', hug: '🫂', angry: '😠', walk_turn: '↩️',
            jog: '🏃', greet: '👋', fight: '🥊', talking: '💬',
            taunt: '😏'
        };

        // Emotion to gesture mapping (editable by user)
        this.emotionGestureMap = {
            happy: ['dance', 'clap', 'happy'],
            sad: ['sad'],
            angry: ['sad'],
            surprised: ['jump'],
            love: ['happy', 'pray'],
            grateful: ['pray', 'clap'],
            excited: ['dance', 'jump', 'clap'],
            neutral: ['idle']
        };

        // Sequence
        this.sequence = [];
        this.isPlayingSequence = false;
        this.currentSeqIndex = -1;
        this.crossfadeDuration = 0.5;

        // Grid
        this.grid = null;
        this.showGrid = true;
    }

    // ========== INIT ==========

    init() {
        this.setupScene();
        this.loadModel();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        const container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e1a);
        this.scene.fog = new THREE.Fog(0x0a0e1a, 300, 1500);

        this.camera = new THREE.PerspectiveCamera(
            45, container.clientWidth / container.clientHeight, 1, 2000
        );
        this.camera.position.set(0, 120, 350);

        // Lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
        hemi.position.set(0, 300, 0);
        this.scene.add(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(50, 200, 100);
        dir.castShadow = true;
        dir.shadow.camera.top = 200;
        dir.shadow.camera.bottom = -200;
        dir.shadow.camera.left = -200;
        dir.shadow.camera.right = 200;
        this.scene.add(dir);

        const rim = new THREE.DirectionalLight(0x6366f1, 0.4);
        rim.position.set(-100, 100, -100);
        this.scene.add(rim);

        // Ground
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(2000, 2000),
            new THREE.MeshPhongMaterial({ color: 0x1a1f35, depthWrite: false })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid
        this.grid = new THREE.GridHelper(2000, 20, 0x6366f1, 0x334155);
        this.grid.material.opacity = 0.3;
        this.grid.material.transparent = true;
        this.scene.add(this.grid);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        // Orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 90, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.update();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    // ========== MODEL & ANIMATIONS ==========

    loadModel() {
        const loader = new GLTFLoader();
        this.setStatus('⏳ Loading avatar...');

        loader.load(
            '/assets/models/rpm_avatar.glb',
            (gltf) => {
                this.model = gltf.scene;

                // Use a stable scale that works with Mixamo FBX animations.
                // Ready Player Me GLB models are typically ~1.7m tall in meters.
                // We scale to 100 (matching Mixamo's cm-based coordinate space)
                // so that animation position tracks don't need extra scaling.
                this.model.scale.set(100, 100, 100);
                this.model.position.set(0, 0, 0);

                // Enable shadows
                this.model.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                    if (child.isSkinnedMesh && !this.skeleton) {
                        this.skeleton = child.skeleton;
                    }
                });

                this.scene.add(this.model);

                // Create mixer — mixer must be bound to the model root
                this.mixer = new THREE.AnimationMixer(this.model);

                // Store bone names for retargeting debug
                this.modelBoneNames = new Set();
                this.model.traverse(child => {
                    if (child.isBone) this.modelBoneNames.add(child.name);
                });
                console.log('Model bones:', [...this.modelBoneNames].join(', '));

                // Load embedded GLB animations
                if (gltf.animations && gltf.animations.length > 0) {
                    gltf.animations.forEach(clip => {
                        this.animations[clip.name] = this.mixer.clipAction(clip);
                        this.animationClips[clip.name] = clip;
                    });
                }

                document.getElementById('avatar-status').textContent = '🟢 Avatar Loaded';
                this.setStatus('Loading animations...');

                // Adjust camera to fit the new scale
                this.camera.position.set(0, 120, 350);
                this.controls.target.set(0, 90, 0);
                this.controls.update();

                // Load FBX animations
                this.loadAllFBXAnimations();
            },
            (p) => {
                if (p.total > 0) {
                    const pct = Math.round((p.loaded / p.total) * 100);
                    document.getElementById('avatar-status').textContent = `⏳ Avatar ${pct}%`;
                }
            },
            (err) => {
                console.error('Model load error:', err);
                document.getElementById('avatar-status').textContent = '🔴 Load Failed';
            }
        );
    }

    loadAllFBXAnimations() {
        const fbxLoader = new FBXLoader();
        const entries = Object.entries(this.animationMap);
        let loaded = 0;
        const total = entries.length;

        entries.forEach(([name, file]) => {
            fbxLoader.load(
                `/assets/animations/${file}`,
                (fbx) => {
                    if (fbx.animations && fbx.animations.length > 0) {
                        const clip = fbx.animations[0];
                        this.cleanAnimationClip(clip);
                        this.animations[name] = this.mixer.clipAction(clip);
                        this.animationClips[name] = clip;
                        console.log(`✓ Loaded: ${name} (${clip.duration.toFixed(1)}s)`);
                    }
                    loaded++;
                    this.setStatus(`Loading animations... ${loaded}/${total}`);
                    if (loaded >= total) this.onAllAnimationsLoaded();
                },
                undefined,
                (err) => {
                    console.warn(`Failed to load ${file}:`, err.message);
                    loaded++;
                    if (loaded >= total) this.onAllAnimationsLoaded();
                }
            );
        });
    }

    cleanAnimationClip(clip) {
        // Bone name mapping from Mixamo/Bip01 to Ready Player Me standard names
        const nameMap = {
            'Pelvis': 'Hips',
            'L_Thigh': 'LeftUpLeg', 'R_Thigh': 'RightUpLeg',
            'L_Calf': 'LeftLeg', 'R_Calf': 'RightLeg',
            'L_Foot': 'LeftFoot', 'R_Foot': 'RightFoot',
            'L_Toe0': 'LeftToeBase', 'R_Toe0': 'RightToeBase',
            'L_Clavicle': 'LeftShoulder', 'R_Clavicle': 'RightShoulder',
            'L_UpperArm': 'LeftArm', 'R_UpperArm': 'RightArm',
            'L_Forearm': 'LeftForeArm', 'R_Forearm': 'RightForeArm',
            'L_Hand': 'LeftHand', 'R_Hand': 'RightHand',
            'Spine1': 'Spine1', 'Spine2': 'Spine2',
            'Hips': 'Hips', 'Spine': 'Spine', 'Neck': 'Neck', 'Head': 'Head'
        };

        // Filter out tracks that cause the avatar to disappear:
        //  - Root-level position tracks (Hips.position moves the whole skeleton)
        //  - Any scale tracks from FBX (they override the model scale)
        clip.tracks = clip.tracks.filter(track => {
            // Strip Mixamo prefixes first to read the real bone + property
            let cleanName = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '');

            const parts = cleanName.split('.');
            const prop = parts.length > 1 ? parts.slice(1).join('.') : '';

            // REMOVE: root position tracks (moves avatar off-screen)
            if (parts[0] === 'Hips' && prop === 'position') {
                console.log(`  ✂️ Stripped root position track: ${track.name}`);
                return false;
            }

            // REMOVE: any scale tracks (overrides model scale)
            if (prop === 'scale') {
                return false;
            }

            return true;
        });

        // Rename remaining tracks with clean bone names
        clip.tracks.forEach(track => {
            let name = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '');

            const parts = name.split('.');
            let boneName = parts[0];
            const prop = parts.length > 1 ? '.' + parts.slice(1).join('.') : '';

            // Apply bone name mapping
            if (nameMap[boneName]) {
                boneName = nameMap[boneName];
            }

            track.name = boneName + prop;
        });
    }

    onAllAnimationsLoaded() {
        const count = Object.keys(this.animations).length;
        document.getElementById('anim-count').textContent = `${count} animations loaded`;
        this.setStatus(`Ready — ${count} animations`);
        this.populateAnimationLibrary();
        this.populateEmotionMap();

        // Start idle
        if (this.animations['idle']) {
            this.playAnimation('idle');
        }
    }

    // ========== PLAY ANIMATION ==========

    playAnimation(name, loopOnce = false) {
        if (!this.mixer) return;
        if (!this.animations[name]) {
            console.warn(`Animation "${name}" not found`);
            return;
        }

        const action = this.animations[name];
        if (this.currentAction === action) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(this.crossfadeDuration);
        }

        action.reset().fadeIn(this.crossfadeDuration);
        action.clampWhenFinished = true;
        action.timeScale = this.animSpeed;

        if (loopOnce) {
            action.setLoop(THREE.LoopOnce);
        } else {
            action.setLoop(document.getElementById('single-loop').checked
                ? THREE.LoopRepeat : THREE.LoopOnce);
        }

        action.play();
        this.currentAction = action;
        this.currentAnimName = name;

        // Update UI
        document.getElementById('now-playing-name').textContent =
            name.charAt(0).toUpperCase() + name.slice(1);

        // Highlight in library
        document.querySelectorAll('.anim-card').forEach(card => {
            card.classList.toggle('playing', card.dataset.name === name);
        });
    }

    // ========== ANIMATION LIBRARY UI ==========

    populateAnimationLibrary() {
        const list = document.getElementById('anim-list');
        list.innerHTML = '';

        Object.entries(this.animations).forEach(([name]) => {
            const clip = this.animationClips[name];
            const duration = clip ? clip.duration.toFixed(1) : '?';
            const icon = this.animIcons[name] || '🎬';
            const fileName = this.animationMap[name] || 'embedded';

            const card = document.createElement('div');
            card.className = 'anim-card';
            card.dataset.name = name;

            card.innerHTML = `
                <div class="anim-icon">${icon}</div>
                <div class="anim-info">
                    <div class="anim-name">${name}</div>
                    <div class="anim-file">${fileName} — ${duration}s</div>
                </div>
                <div class="anim-actions">
                    <button class="btn-add-seq" title="Add to sequence">+ Seq</button>
                    <button class="btn-convert-glb" title="Export as GLB">📦 GLB</button>
                </div>
            `;

            // Click card to preview animation
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                this.playAnimation(name);
            });

            // Add to sequence
            card.querySelector('.btn-add-seq').addEventListener('click', (e) => {
                e.stopPropagation();
                this.addToSequence(name);
            });

            // Convert to GLB
            card.querySelector('.btn-convert-glb').addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportAnimationAsGLB(name);
            });

            list.appendChild(card);
        });
    }

    populateEmotionMap() {
        const list = document.getElementById('emotion-map-list');
        list.innerHTML = '';

        Object.entries(this.emotionGestureMap).forEach(([emotion, gestures]) => {
            const row = document.createElement('div');
            row.className = 'emotion-map-row';
            row.innerHTML = `
                <span class="emo-label">${emotion}</span>
                <span class="emo-arrow">→</span>
                <span class="emo-anim">${gestures.join(', ')}</span>
            `;
            list.appendChild(row);
        });
    }

    // ========== SEQUENCE BUILDER ==========

    addToSequence(name) {
        const clip = this.animationClips[name];
        const duration = clip ? parseFloat(clip.duration.toFixed(1)) : 2.0;

        this.sequence.push({
            name: name,
            duration: duration,
            loopOnce: true,
            icon: this.animIcons[name] || '🎬'
        });

        this.renderSequence();
        this.setStatus(`Added "${name}" to sequence`);
    }

    removeFromSequence(index) {
        this.sequence.splice(index, 1);
        this.renderSequence();
    }

    moveInSequence(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.sequence.length) return;
        const temp = this.sequence[index];
        this.sequence[index] = this.sequence[newIndex];
        this.sequence[newIndex] = temp;
        this.renderSequence();
    }

    renderSequence() {
        const container = document.getElementById('sequence-timeline');
        container.innerHTML = '';

        if (this.sequence.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No gestures in sequence</p>
                    <small>Click animations from the library to add them here</small>
                </div>`;
            document.getElementById('seq-total-items').textContent = '0';
            document.getElementById('seq-total-time').textContent = '0.0s';
            return;
        }

        let totalTime = 0;

        this.sequence.forEach((item, i) => {
            totalTime += item.duration;

            const el = document.createElement('div');
            el.className = 'seq-item' + (i === this.currentSeqIndex ? ' active' : '');
            el.innerHTML = `
                <div class="seq-number">${i + 1}</div>
                <div class="seq-icon">${item.icon}</div>
                <div class="seq-info">
                    <div class="seq-name">${item.name}</div>
                    <div class="seq-duration">
                        <input type="number" class="seq-duration-input" value="${item.duration}" min="0.5" max="30" step="0.5">
                        seconds
                    </div>
                </div>
                <div class="seq-controls">
                    <button class="seq-ctrl-btn seq-up" title="Move Up">▲</button>
                    <button class="seq-ctrl-btn seq-down" title="Move Down">▼</button>
                    <button class="seq-ctrl-btn seq-remove" title="Remove">✕</button>
                </div>
            `;

            // Duration change
            el.querySelector('.seq-duration-input').addEventListener('change', (e) => {
                this.sequence[i].duration = parseFloat(e.target.value) || 2.0;
                this.updateSequenceInfo();
            });

            el.querySelector('.seq-up').addEventListener('click', () => this.moveInSequence(i, -1));
            el.querySelector('.seq-down').addEventListener('click', () => this.moveInSequence(i, 1));
            el.querySelector('.seq-remove').addEventListener('click', () => this.removeFromSequence(i));

            container.appendChild(el);

            // Connector between items (except last)
            if (i < this.sequence.length - 1) {
                const conn = document.createElement('div');
                conn.className = 'seq-connector';
                conn.textContent = `↓ crossfade ${this.crossfadeDuration}s`;
                container.appendChild(conn);
            }
        });

        this.updateSequenceInfo();
    }

    updateSequenceInfo() {
        let totalTime = this.sequence.reduce((sum, item) => sum + item.duration, 0);
        document.getElementById('seq-total-items').textContent = this.sequence.length;
        document.getElementById('seq-total-time').textContent = `${totalTime.toFixed(1)}s`;
    }

    // ========== SEQUENCE PLAYBACK ==========

    async playSequence() {
        if (this.sequence.length === 0) {
            alert('Add some animations to the sequence first!');
            return;
        }

        this.isPlayingSequence = true;
        this.setStatus('▶️ Playing sequence...');

        const loop = document.getElementById('loop-sequence').checked;
        const autoIdle = document.getElementById('auto-idle').checked;

        do {
            for (let i = 0; i < this.sequence.length; i++) {
                if (!this.isPlayingSequence) break;

                this.currentSeqIndex = i;
                this.renderSequence();

                const item = this.sequence[i];
                this.playAnimation(item.name, item.loopOnce);

                // Wait for the duration
                await this.wait(item.duration * 1000);
            }
        } while (loop && this.isPlayingSequence);

        this.currentSeqIndex = -1;
        this.isPlayingSequence = false;
        this.renderSequence();

        if (autoIdle && this.animations['idle']) {
            this.playAnimation('idle');
        }

        this.setStatus('Sequence finished');
    }

    stopSequence() {
        this.isPlayingSequence = false;
        this.currentSeqIndex = -1;
        this.renderSequence();

        if (this.animations['idle']) {
            this.playAnimation('idle');
        }
        this.setStatus('Stopped');
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========== EMOTION TEST ==========

    triggerEmotion(emotion) {
        const gestures = this.emotionGestureMap[emotion];
        if (!gestures || gestures.length === 0) {
            this.playAnimation('idle');
            return;
        }

        // Pick random gesture from the emotion's list
        const gesture = gestures[Math.floor(Math.random() * gestures.length)];
        this.playAnimation(gesture, true);

        // Return to idle after the animation
        const clip = this.animationClips[gesture];
        const duration = clip ? clip.duration * 1000 : 3000;

        setTimeout(() => {
            if (this.currentAnimName === gesture) {
                this.playAnimation('idle');
            }
        }, duration + 500);

        this.setStatus(`Emotion "${emotion}" → gesture "${gesture}"`);
    }

    // ========== FBX UPLOAD ==========

    async uploadFBX(file) {
        if (!this.mixer) {
            alert('Wait for avatar to load first.');
            return;
        }

        const fbxLoader = new FBXLoader();
        const url = URL.createObjectURL(file);
        const rawName = file.name.replace('.fbx', '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        // Check if name already exists
        let name = rawName;
        let counter = 1;
        while (this.animations[name]) {
            name = `${rawName}_${counter}`;
            counter++;
        }

        this.setStatus(`Uploading ${file.name}...`);

        fbxLoader.load(
            url,
            (fbx) => {
                URL.revokeObjectURL(url);
                if (fbx.animations && fbx.animations.length > 0) {
                    const clip = fbx.animations[0];
                    this.cleanAnimationClip(clip);
                    this.animations[name] = this.mixer.clipAction(clip);
                    this.animationClips[name] = clip;
                    this.animationMap[name] = file.name;
                    this.animIcons[name] = '🆕';

                    this.populateAnimationLibrary();
                    document.getElementById('anim-count').textContent =
                        `${Object.keys(this.animations).length} animations loaded`;
                    this.setStatus(`✓ Uploaded "${name}" (${clip.duration.toFixed(1)}s)`);

                    // Preview it immediately
                    this.playAnimation(name);
                } else {
                    this.setStatus(`⚠️ No animation data in ${file.name}`);
                    alert(`No animation data found in ${file.name}`);
                }
            },
            undefined,
            (err) => {
                URL.revokeObjectURL(url);
                console.error('FBX load error:', err);
                this.setStatus(`❌ Error loading ${file.name}`);
                alert(`Error loading ${file.name}: ${err.message}`);
            }
        );
    }

    // ========== SAVE / LOAD / EXPORT ==========

    saveSequence() {
        const data = {
            version: '1.0',
            type: 'gesture_sequence',
            crossfadeDuration: this.crossfadeDuration,
            emotionMap: this.emotionGestureMap,
            sequence: this.sequence.map(item => ({
                name: item.name,
                duration: item.duration,
                loopOnce: item.loopOnce
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `gesture_sequence_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.setStatus('Sequence saved!');
    }

    loadSequence() {
        document.getElementById('file-input').click();
    }

    handleSequenceLoad(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.sequence) {
                    this.sequence = data.sequence.map(item => ({
                        ...item,
                        icon: this.animIcons[item.name] || '🎬'
                    }));
                }
                if (data.crossfadeDuration) {
                    this.crossfadeDuration = data.crossfadeDuration;
                    document.getElementById('crossfade-slider').value = this.crossfadeDuration;
                    document.getElementById('crossfade-value').textContent = `${this.crossfadeDuration}s`;
                }
                if (data.emotionMap) {
                    this.emotionGestureMap = data.emotionMap;
                    this.populateEmotionMap();
                }
                this.renderSequence();
                this.setStatus('Sequence loaded!');
            } catch (err) {
                alert('Error loading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    exportSequence() {
        if (this.sequence.length === 0) {
            alert('No sequence to export.');
            return;
        }

        const data = {
            name: 'Custom Gesture Sequence',
            type: 'aura_gesture_export',
            totalDuration: this.sequence.reduce((s, i) => s + i.duration, 0),
            crossfade: this.crossfadeDuration,
            gestures: this.sequence.map((item, i) => ({
                order: i + 1,
                animation: item.name,
                duration: item.duration,
                file: this.animationMap[item.name] || 'unknown'
            })),
            emotionMapping: this.emotionGestureMap
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `gesture_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.setStatus('Exported!');
    }

    exportAnimationAsGLB(name) {
        if (!this.model || !this.animationClips[name]) {
            alert('Model or animation not ready.');
            return;
        }

        this.setStatus(`⏳ Forging GLB for "${name}"...`);
        const clip = this.animationClips[name].clone();
        
        const exporter = new GLTFExporter();
        const options = {
            binary: true,
            animations: [clip],
            includeCustomExtensions: false
        };

        exporter.parse(
            this.model,
            (result) => {
                const blob = new Blob([result], { type: 'application/octet-stream' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${name.replace(/\s+/g, '_')}.glb`;
                a.click();
                URL.revokeObjectURL(a.href);
                this.setStatus(`✓ "${name}" forged to GLB!`);
            },
            (err) => {
                console.error('Export failed:', err);
                this.setStatus('🔴 Export failed');
            },
            options
        );
    }

    // ========== EVENTS ==========

    setupEventListeners() {
        // Header
        document.getElementById('save-sequence').addEventListener('click', () => this.saveSequence());
        document.getElementById('load-sequence').addEventListener('click', () => this.loadSequence());
        document.getElementById('export-sequence').addEventListener('click', () => this.exportSequence());

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleSequenceLoad(e.target.files[0]);
        });

        // Upload FBX
        document.getElementById('upload-anim').addEventListener('click', () => {
            document.getElementById('fbx-upload').click();
        });
        document.getElementById('fbx-upload').addEventListener('change', (e) => {
            if (e.target.files[0]) this.uploadFBX(e.target.files[0]);
        });

        // Preview controls
        document.getElementById('reset-camera').addEventListener('click', () => {
            this.camera.position.set(0, 120, 350);
            this.controls.target.set(0, 90, 0);
            this.controls.update();
        });

        document.getElementById('toggle-grid').addEventListener('click', (e) => {
            this.showGrid = !this.showGrid;
            this.grid.visible = this.showGrid;
            e.currentTarget.classList.toggle('active');
        });

        document.getElementById('toggle-wireframe').addEventListener('click', (e) => {
            const wireframe = e.currentTarget.classList.toggle('active');
            if (this.model) {
                this.model.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.wireframe = wireframe;
                    }
                });
            }
        });

        // Speed controls
        document.getElementById('anim-speed-down').addEventListener('click', () => {
            this.animSpeed = Math.max(0.25, this.animSpeed - 0.25);
            this.applySpeed();
        });
        document.getElementById('anim-speed-up').addEventListener('click', () => {
            this.animSpeed = Math.min(3.0, this.animSpeed + 0.25);
            this.applySpeed();
        });

        // Loop toggle
        document.getElementById('single-loop').addEventListener('change', () => {
            if (this.currentAction) {
                const checked = document.getElementById('single-loop').checked;
                this.currentAction.setLoop(checked ? THREE.LoopRepeat : THREE.LoopOnce);
            }
        });

        // Sequence controls
        document.getElementById('play-sequence').addEventListener('click', () => this.playSequence());
        document.getElementById('stop-sequence').addEventListener('click', () => this.stopSequence());
        document.getElementById('clear-sequence').addEventListener('click', () => {
            if (this.sequence.length === 0 || confirm('Clear the entire sequence?')) {
                this.sequence = [];
                this.renderSequence();
            }
        });

        // Crossfade slider
        document.getElementById('crossfade-slider').addEventListener('input', (e) => {
            this.crossfadeDuration = parseFloat(e.target.value);
            document.getElementById('crossfade-value').textContent = `${this.crossfadeDuration}s`;
        });

        // Emotion test buttons
        document.querySelectorAll('.emotion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.triggerEmotion(btn.dataset.emotion);
            });
        });
    }

    applySpeed() {
        document.getElementById('anim-speed').textContent = `${this.animSpeed.toFixed(2)}x`;
        if (this.currentAction) {
            this.currentAction.timeScale = this.animSpeed;
        }
    }

    setStatus(msg) {
        document.getElementById('studio-status').textContent = msg;
    }

    onWindowResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // ========== RENDER LOOP ==========

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = Math.min(this.clock.getDelta(), 0.05);
        if (this.mixer) this.mixer.update(delta);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// ---- Start ----
const studio = new GestureStudio();
studio.init();
window.gestureStudio = studio;
