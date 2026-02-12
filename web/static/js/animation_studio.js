import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class AnimationStudio {
    constructor() {
        // 3D Scene
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.avatar = null;
        this.faceMesh = null;
        this.morphTargetDictionary = {};
        this.clock = new THREE.Clock();

        // Animation Data
        this.blendShapes = {};
        this.keyframes = [];
        this.currentTime = 0;
        this.duration = 5000; // milliseconds
        this.isPlaying = false;
        this.selectedKeyframeIndex = null;

        // UI State
        this.showGrid = true;
        this.showWireframe = false;

        // Blend Shape Categories (no duplicates)
        this.categories = {
            mouth: [
                'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
                'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
                'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
                'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
                'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
                'mouthUpperUpLeft', 'mouthUpperUpRight'
            ],
            eyes: [
                'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
                'eyeSquintLeft', 'eyeSquintRight', 'eyeLookUpLeft', 'eyeLookUpRight',
                'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookOutRight'
            ],
            brows: [
                'browDownLeft', 'browDownRight', 'browInnerUp',
                'browOuterUpLeft', 'browOuterUpRight'
            ],
            jaw: ['jawOpen', 'jawForward', 'jawLeft', 'jawRight'],
            nose: [
                'noseSneerLeft', 'noseSneerRight',
                'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight'
            ],
            other: ['tongueOut']
        };

        // Emotion Presets
        this.emotionPresets = {
            neutral: {},
            happy: {
                mouthSmileLeft: 0.7, mouthSmileRight: 0.7,
                eyeSquintLeft: 0.5, eyeSquintRight: 0.5,
                cheekSquintLeft: 0.3, cheekSquintRight: 0.3,
                browInnerUp: 0.3
            },
            sad: {
                browInnerUp: 0.7,
                mouthFrownLeft: 0.5, mouthFrownRight: 0.5,
                eyeBlinkLeft: 0.3, eyeBlinkRight: 0.3,
                mouthPucker: 0.3
            },
            angry: {
                browDownLeft: 0.7, browDownRight: 0.7,
                eyeSquintLeft: 0.5, eyeSquintRight: 0.5,
                mouthPressLeft: 0.5, mouthPressRight: 0.5,
                noseSneerLeft: 0.3, noseSneerRight: 0.3,
                jawForward: 0.3
            },
            surprised: {
                eyeWideLeft: 0.7, eyeWideRight: 0.7,
                browInnerUp: 0.7,
                browOuterUpLeft: 0.7, browOuterUpRight: 0.7,
                jawOpen: 0.5, mouthFunnel: 0.3
            },
            fear: {
                eyeWideLeft: 0.7, eyeWideRight: 0.7,
                browInnerUp: 0.7,
                mouthStretchLeft: 0.5, mouthStretchRight: 0.5,
                jawOpen: 0.3
            },
            disgust: {
                noseSneerLeft: 0.7, noseSneerRight: 0.7,
                mouthUpperUpLeft: 0.5, mouthUpperUpRight: 0.5,
                browDownLeft: 0.3, browDownRight: 0.3
            }
        };
    }

    // -------- Initialization --------

    init() {
        this.setupScene();
        this.loadAvatar();
        this.setupUI();
        this.setupEventListeners();
        this.animate();
    }

    setupScene() {
        const container = document.getElementById('canvas-container');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e1a);
        this.scene.fog = new THREE.Fog(0x0a0e1a, 200, 1000);

        this.camera = new THREE.PerspectiveCamera(
            45, container.clientWidth / container.clientHeight, 1, 2000
        );
        this.camera.position.set(0, 150, 400);

        // Lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
        hemi.position.set(0, 200, 0);
        this.scene.add(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(0, 200, 100);
        dir.castShadow = true;
        this.scene.add(dir);

        const rim = new THREE.DirectionalLight(0x6366f1, 0.5);
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

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.update();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    // -------- Avatar Loading --------

    loadAvatar() {
        const loader = new GLTFLoader();
        loader.load(
            '/assets/models/rpm_avatar.glb',
            (gltf) => this.onAvatarLoaded(gltf),
            (p) => {
                if (p.total > 0) {
                    const pct = Math.round((p.loaded / p.total) * 100);
                    document.getElementById('avatar-status').textContent = `⏳ Loading ${pct}%`;
                }
            },
            (err) => {
                console.error('Avatar load error:', err);
                document.getElementById('avatar-status').textContent = '🔴 Load Failed';
            }
        );
    }

    onAvatarLoaded(gltf) {
        this.avatar = gltf.scene;

        // Auto-scale
        const box = new THREE.Box3().setFromObject(this.avatar);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const s = 150 / maxDim;
            this.avatar.scale.set(s, s, s);
        }
        this.avatar.position.y = -75;

        // Find ALL meshes with morph targets
        const foundMeshes = [];
        this.avatar.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.morphTargetInfluences && child.morphTargetDictionary) {
                    foundMeshes.push(child);
                }
            }
        });

        if (foundMeshes.length > 0) {
            // Pick the mesh with the most morph targets
            foundMeshes.sort((a, b) =>
                Object.keys(b.morphTargetDictionary).length - Object.keys(a.morphTargetDictionary).length
            );
            this.faceMesh = foundMeshes[0];
            this.morphTargetDictionary = { ...this.faceMesh.morphTargetDictionary };
            console.log(`Face mesh: "${this.faceMesh.name}", ${Object.keys(this.morphTargetDictionary).length} morph targets`);

            // Initialize all blend shapes to 0
            Object.keys(this.morphTargetDictionary).forEach(name => {
                this.blendShapes[name] = 0;
            });

            this.populateBlendShapeControls();
            this.updateStatus();
            document.getElementById('avatar-status').textContent =
                `🟢 Avatar Loaded — ${Object.keys(this.morphTargetDictionary).length} shapes`;
        } else {
            document.getElementById('avatar-status').textContent = '🟡 Avatar Loaded (No Blend Shapes)';
        }

        this.scene.add(this.avatar);
    }

    // -------- Blend Shape UI --------

    populateBlendShapeControls() {
        Object.keys(this.categories).forEach(cat => {
            const el = document.getElementById(`${cat}-shapes`);
            if (el) el.innerHTML = '';
        });

        const alreadyAdded = new Set();

        Object.entries(this.categories).forEach(([cat, names]) => {
            const container = document.getElementById(`${cat}-shapes`);
            if (!container) return;

            let count = 0;
            names.forEach(name => {
                if (name in this.morphTargetDictionary && !alreadyAdded.has(name)) {
                    container.appendChild(this.createShapeControl(name));
                    alreadyAdded.add(name);
                    count++;
                }
            });

            // Update button text with count
            const btn = document.querySelector(`[data-category="${cat}"]`);
            if (btn) {
                const icon = btn.querySelector('.icon').textContent;
                const label = btn.textContent.replace(/\d+/g, '').trim();
                btn.innerHTML = `<span class="icon">${icon}</span> ${label} (${count})`;
            }
        });

        // Also add any shapes from the model that aren't in our categories
        const uncategorised = Object.keys(this.morphTargetDictionary).filter(n => !alreadyAdded.has(n));
        if (uncategorised.length > 0) {
            const container = document.getElementById('other-shapes');
            uncategorised.forEach(name => {
                container.appendChild(this.createShapeControl(name));
                alreadyAdded.add(name);
            });
            const btn = document.querySelector('[data-category="other"]');
            if (btn) {
                btn.innerHTML = `<span class="icon">✨</span> Other (${container.children.length})`;
            }
        }
    }

    createShapeControl(shapeName) {
        const control = document.createElement('div');
        control.className = 'shape-control';
        control.dataset.shape = shapeName;

        const header = document.createElement('div');
        header.className = 'shape-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'shape-name';
        nameSpan.textContent = shapeName;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'shape-value';
        valueSpan.textContent = '0.00';

        header.appendChild(nameSpan);
        header.appendChild(valueSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'shape-slider';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = '0';

        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            this.blendShapes[shapeName] = value;
            valueSpan.textContent = value.toFixed(2);
            this.updateAvatar();
        });

        control.appendChild(header);
        control.appendChild(slider);
        return control;
    }

    // -------- Avatar Update --------

    updateAvatar() {
        if (!this.faceMesh) return;
        Object.entries(this.blendShapes).forEach(([name, value]) => {
            const idx = this.morphTargetDictionary[name];
            if (idx !== undefined) {
                this.faceMesh.morphTargetInfluences[idx] = value;
            }
        });
    }

    refreshSliders() {
        document.querySelectorAll('.shape-control').forEach(control => {
            const name = control.dataset.shape;
            const slider = control.querySelector('.shape-slider');
            const label = control.querySelector('.shape-value');
            const value = this.blendShapes[name] || 0;
            slider.value = value;
            label.textContent = value.toFixed(2);
        });
    }

    // -------- Emotion Presets --------

    applyEmotion(emotion) {
        const preset = this.emotionPresets[emotion];
        if (!preset && emotion !== 'neutral') return;

        // Reset all
        Object.keys(this.blendShapes).forEach(k => { this.blendShapes[k] = 0; });

        // Apply preset values
        if (preset) {
            Object.entries(preset).forEach(([name, value]) => {
                if (name in this.blendShapes) {
                    this.blendShapes[name] = value;
                }
            });
        }

        this.refreshSliders();
        this.updateAvatar();
    }

    // -------- Keyframe System --------

    addKeyframe() {
        const kf = {
            time: this.currentTime,
            shapes: { ...this.blendShapes }
        };

        const existing = this.keyframes.findIndex(k => k.time === this.currentTime);
        if (existing !== -1) {
            this.keyframes[existing] = kf;
        } else {
            this.keyframes.push(kf);
            this.keyframes.sort((a, b) => a.time - b.time);
        }

        this.renderKeyframeList();
        this.renderKeyframeMarkers();

        document.getElementById('selection-info').textContent =
            `Keyframe added at ${(this.currentTime / 1000).toFixed(2)}s`;
    }

    deleteKeyframe(index) {
        this.keyframes.splice(index, 1);
        if (this.selectedKeyframeIndex === index) this.selectedKeyframeIndex = null;
        this.renderKeyframeList();
        this.renderKeyframeMarkers();
    }

    selectKeyframe(index) {
        this.selectedKeyframeIndex = index;
        this.goToKeyframe(index);
        this.renderKeyframeList();
    }

    goToKeyframe(index) {
        const kf = this.keyframes[index];
        if (!kf) return;

        this.currentTime = kf.time;
        this.blendShapes = { ...kf.shapes };

        document.getElementById('timeline-slider').value = this.currentTime;
        document.getElementById('current-time').textContent = `${(this.currentTime / 1000).toFixed(2)}s`;
        document.getElementById('selection-info').textContent =
            `Selected keyframe at ${(kf.time / 1000).toFixed(2)}s`;

        this.refreshSliders();
        this.updateAvatar();
    }

    renderKeyframeList() {
        const container = document.getElementById('keyframes-container');

        if (this.keyframes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No keyframes yet</p>
                    <small>Click "Add Keyframe" to start animating</small>
                </div>`;
            return;
        }

        container.innerHTML = '';

        this.keyframes.forEach((kf, i) => {
            const item = document.createElement('div');
            item.className = 'keyframe-item' + (i === this.selectedKeyframeIndex ? ' selected' : '');

            const activeCount = Object.values(kf.shapes).filter(v => v > 0).length;

            item.innerHTML = `
                <div class="keyframe-time">${(kf.time / 1000).toFixed(2)}s</div>
                <div class="keyframe-shapes">${activeCount} active blend shapes</div>
                <div class="keyframe-actions">
                    <button class="btn-small kf-goto">Go To</button>
                    <button class="btn-small kf-delete">Delete</button>
                </div>`;

            item.querySelector('.kf-goto').addEventListener('click', (e) => {
                e.stopPropagation();
                this.goToKeyframe(i);
            });
            item.querySelector('.kf-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteKeyframe(i);
            });
            item.addEventListener('click', () => this.selectKeyframe(i));

            container.appendChild(item);
        });
    }

    renderKeyframeMarkers() {
        const container = document.getElementById('keyframe-markers');
        container.innerHTML = '';
        this.keyframes.forEach(kf => {
            const marker = document.createElement('div');
            marker.className = 'keyframe-marker';
            marker.style.left = `${(kf.time / this.duration) * 100}%`;
            container.appendChild(marker);
        });
    }

    // -------- Playback --------

    playAnimation() {
        if (this.keyframes.length < 2) {
            alert('You need at least 2 keyframes to play an animation.');
            return;
        }
        this.isPlaying = true;
        this.clock.getDelta(); // flush any large delta
        document.getElementById('play-pause').textContent = '⏸️';
    }

    pauseAnimation() {
        this.isPlaying = false;
        document.getElementById('play-pause').textContent = '▶️';
    }

    stopAnimation() {
        this.isPlaying = false;
        this.currentTime = 0;
        document.getElementById('timeline-slider').value = 0;
        document.getElementById('current-time').textContent = '0.00s';
        document.getElementById('play-pause').textContent = '▶️';
        if (this.keyframes.length > 0) this.goToKeyframe(0);
    }

    updateAnimation(deltaMs) {
        if (!this.isPlaying || this.keyframes.length < 2) return;

        this.currentTime += deltaMs;

        if (this.currentTime > this.duration) {
            if (document.getElementById('loop-checkbox').checked) {
                this.currentTime = 0;
            } else {
                this.stopAnimation();
                return;
            }
        }

        // Interpolate between surrounding keyframes
        let prev = null, next = null;
        for (let i = 0; i < this.keyframes.length; i++) {
            if (this.keyframes[i].time <= this.currentTime) prev = this.keyframes[i];
            if (this.keyframes[i].time > this.currentTime && !next) next = this.keyframes[i];
        }

        if (prev && next) {
            const span = next.time - prev.time;
            const t = span > 0 ? (this.currentTime - prev.time) / span : 0;
            // Smooth-step easing
            const ease = t * t * (3 - 2 * t);
            Object.keys(this.blendShapes).forEach(name => {
                const a = prev.shapes[name] || 0;
                const b = next.shapes[name] || 0;
                this.blendShapes[name] = a + (b - a) * ease;
            });
            this.updateAvatar();
        } else if (prev) {
            Object.keys(this.blendShapes).forEach(name => {
                this.blendShapes[name] = prev.shapes[name] || 0;
            });
            this.updateAvatar();
        }

        // Update timeline UI
        document.getElementById('timeline-slider').value = this.currentTime;
        document.getElementById('current-time').textContent = `${(this.currentTime / 1000).toFixed(2)}s`;
    }

    // -------- Demo Animations --------

    loadDemo(name) {
        // Clear existing keyframes
        this.keyframes = [];

        const emptyShapes = () => {
            const s = {};
            Object.keys(this.blendShapes).forEach(k => { s[k] = 0; });
            return s;
        };

        switch (name) {
            case 'talk': {
                this.duration = 3000;
                // Simulate talking: jaw open/close cycle
                const k0 = emptyShapes();
                const k1 = emptyShapes();
                k1.jawOpen = 0.5; k1.mouthFunnel = 0.2;
                const k2 = emptyShapes();
                k2.jawOpen = 0.1; k2.mouthPucker = 0.3;
                const k3 = emptyShapes();
                k3.jawOpen = 0.6; k3.mouthSmileLeft = 0.2; k3.mouthSmileRight = 0.2;
                const k4 = emptyShapes();
                k4.jawOpen = 0.05; k4.mouthClose = 0.3;
                const k5 = emptyShapes();
                k5.jawOpen = 0.4; k5.mouthStretchLeft = 0.2; k5.mouthStretchRight = 0.2;
                const k6 = emptyShapes();

                this.keyframes = [
                    { time: 0, shapes: k0 },
                    { time: 400, shapes: k1 },
                    { time: 800, shapes: k2 },
                    { time: 1200, shapes: k3 },
                    { time: 1600, shapes: k4 },
                    { time: 2200, shapes: k5 },
                    { time: 3000, shapes: k6 }
                ];
                break;
            }
            case 'blink': {
                this.duration = 2000;
                const open = emptyShapes();
                const closed = emptyShapes();
                closed.eyeBlinkLeft = 1; closed.eyeBlinkRight = 1;
                this.keyframes = [
                    { time: 0, shapes: { ...open } },
                    { time: 800, shapes: { ...open } },
                    { time: 950, shapes: { ...closed } },
                    { time: 1100, shapes: { ...open } },
                    { time: 2000, shapes: { ...open } }
                ];
                break;
            }
            case 'happyToSad': {
                this.duration = 4000;
                const neutral = emptyShapes();
                const happy = { ...neutral };
                happy.mouthSmileLeft = 0.7; happy.mouthSmileRight = 0.7;
                happy.eyeSquintLeft = 0.5; happy.eyeSquintRight = 0.5;
                happy.cheekSquintLeft = 0.3; happy.cheekSquintRight = 0.3;
                const sad = { ...neutral };
                sad.browInnerUp = 0.7; sad.mouthFrownLeft = 0.5; sad.mouthFrownRight = 0.5;
                sad.eyeBlinkLeft = 0.3; sad.eyeBlinkRight = 0.3;
                this.keyframes = [
                    { time: 0, shapes: { ...neutral } },
                    { time: 800, shapes: happy },
                    { time: 2000, shapes: happy },
                    { time: 3200, shapes: sad },
                    { time: 4000, shapes: sad }
                ];
                break;
            }
            case 'surprise': {
                this.duration = 2500;
                const rest = emptyShapes();
                const shock = { ...rest };
                shock.eyeWideLeft = 0.9; shock.eyeWideRight = 0.9;
                shock.browInnerUp = 0.8; shock.browOuterUpLeft = 0.8; shock.browOuterUpRight = 0.8;
                shock.jawOpen = 0.6; shock.mouthFunnel = 0.3;
                const afterShock = { ...rest };
                afterShock.eyeWideLeft = 0.3; afterShock.eyeWideRight = 0.3;
                afterShock.mouthSmileLeft = 0.4; afterShock.mouthSmileRight = 0.4;
                this.keyframes = [
                    { time: 0, shapes: { ...rest } },
                    { time: 200, shapes: { ...rest } },
                    { time: 600, shapes: shock },
                    { time: 1200, shapes: shock },
                    { time: 2000, shapes: afterShock },
                    { time: 2500, shapes: { ...rest } }
                ];
                break;
            }
        }

        // Sync UI
        document.getElementById('duration-input').value = this.duration / 1000;
        document.getElementById('timeline-slider').max = this.duration;
        document.getElementById('total-duration').textContent = `${(this.duration / 1000).toFixed(2)}s`;

        this.renderKeyframeList();
        this.renderKeyframeMarkers();

        // Go to first keyframe
        if (this.keyframes.length > 0) {
            this.goToKeyframe(0);
        }

        document.getElementById('selection-info').textContent =
            `Demo "${name}" loaded (${this.keyframes.length} keyframes)`;
    }

    // -------- Save / Load / Export --------

    saveProject() {
        const project = {
            version: '1.0',
            duration: this.duration,
            keyframes: this.keyframes,
            blendShapes: this.blendShapes
        };
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aura_animation_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    loadProject() {
        document.getElementById('file-input').click();
    }

    handleProjectLoad(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const project = JSON.parse(e.target.result);
                this.duration = project.duration;
                this.keyframes = project.keyframes;
                if (project.blendShapes) this.blendShapes = project.blendShapes;

                document.getElementById('duration-input').value = this.duration / 1000;
                document.getElementById('timeline-slider').max = this.duration;
                document.getElementById('total-duration').textContent = `${(this.duration / 1000).toFixed(2)}s`;

                this.renderKeyframeList();
                this.renderKeyframeMarkers();
                if (this.keyframes.length > 0) this.goToKeyframe(0);

                document.getElementById('selection-info').textContent = 'Project loaded!';
            } catch (err) {
                alert('Error loading project: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    exportAnimation() {
        if (this.keyframes.length === 0) { alert('No keyframes to export'); return; }
        const data = {
            name: 'Custom Animation',
            duration: this.duration / 1000,
            keyframes: this.keyframes.map(kf => ({
                time: kf.time / 1000,
                shapes: kf.shapes
            }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aura_export_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // -------- Utility --------

    resetAll() {
        Object.keys(this.blendShapes).forEach(k => { this.blendShapes[k] = 0; });
        this.refreshSliders();
        this.updateAvatar();
    }

    updateStatus() {
        const count = Object.keys(this.morphTargetDictionary).length;
        document.getElementById('shapes-count').textContent = `${count} blend shapes available`;
    }

    // -------- Event Wiring --------

    setupUI() {
        // Category toggles
        document.querySelectorAll('.category-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                const list = document.getElementById(`${btn.dataset.category}-shapes`);
                list.classList.toggle('collapsed');
            });
        });

        // Search
        document.getElementById('search-shapes').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.shape-control').forEach(c => {
                c.style.display = c.dataset.shape.toLowerCase().includes(q) ? '' : 'none';
            });
            // Also expand all categories when searching
            if (q.length > 0) {
                document.querySelectorAll('.shape-list').forEach(l => l.classList.remove('collapsed'));
            }
        });
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('save-project').addEventListener('click', () => this.saveProject());
        document.getElementById('load-project').addEventListener('click', () => this.loadProject());
        document.getElementById('export-animation').addEventListener('click', () => this.exportAnimation());
        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleProjectLoad(e.target.files[0]);
        });

        // Preview controls
        document.getElementById('reset-camera').addEventListener('click', () => {
            this.camera.position.set(0, 150, 400);
            this.controls.target.set(0, 100, 0);
            this.controls.update();
        });
        document.getElementById('toggle-grid').addEventListener('click', (e) => {
            this.showGrid = !this.showGrid;
            this.grid.visible = this.showGrid;
            e.currentTarget.classList.toggle('active');
        });
        document.getElementById('toggle-wireframe').addEventListener('click', (e) => {
            this.showWireframe = !this.showWireframe;
            if (this.avatar) {
                this.avatar.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.wireframe = this.showWireframe;
                    }
                });
            }
            e.currentTarget.classList.toggle('active');
        });

        // Emotion presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyEmotion(btn.dataset.emotion));
        });

        // Demo animation buttons
        document.querySelectorAll('.demo-btn').forEach(btn => {
            btn.addEventListener('click', () => this.loadDemo(btn.dataset.demo));
        });

        // Playback
        document.getElementById('play-pause').addEventListener('click', () => {
            this.isPlaying ? this.pauseAnimation() : this.playAnimation();
        });
        document.getElementById('stop').addEventListener('click', () => this.stopAnimation());
        document.getElementById('add-keyframe').addEventListener('click', () => this.addKeyframe());

        // Timeline slider
        document.getElementById('timeline-slider').addEventListener('input', (e) => {
            this.currentTime = parseInt(e.target.value);
            document.getElementById('current-time').textContent = `${(this.currentTime / 1000).toFixed(2)}s`;
            if (this.isPlaying) this.pauseAnimation();
        });

        // Reset all
        document.getElementById('reset-all').addEventListener('click', () => this.resetAll());

        // Duration
        document.getElementById('duration-input').addEventListener('change', (e) => {
            this.duration = parseFloat(e.target.value) * 1000;
            document.getElementById('timeline-slider').max = this.duration;
            document.getElementById('total-duration').textContent = `${(this.duration / 1000).toFixed(2)}s`;
        });
    }

    onWindowResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // -------- Render Loop --------

    animate() {
        requestAnimationFrame(() => this.animate());
        // Cap delta to 50ms to prevent jumps
        const delta = Math.min(this.clock.getDelta() * 1000, 50);
        this.updateAnimation(delta);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// ---- Start ----
const studio = new AnimationStudio();
studio.init();
window.animationStudio = studio;
