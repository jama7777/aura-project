# AURA Blend Shape Animation Studio

## Overview

The **AURA Blend Shape Animation Studio** is a professional-grade web-based tool for creating custom facial animations using blend shapes (morph targets). This powerful software allows you to:

- **Control individual blend shapes** with precision sliders
- **Create keyframe animations** with timeline-based editing
- **Preview animations in real-time** on your 3D avatar
- **Apply emotion presets** for quick animation start points
- **Save and export** animation projects as JSON files
- **Import existing animations** for editing and refinement

---

## Features

### 1. 🎨 **Blend Shape Control Panel**
- **65+ Blend Shapes** organized by facial region:
  - 👄 **Mouth** (32 shapes): Jaw, lips, tongue control
  - 👁️ **Eyes** (12 shapes): Blink, wide, squint, look directions
  - 🤨 **Brows** (7 shapes): Inner, outer, up, down movements
  - 🦷 **Jaw** (4 shapes): Open, forward, left, right
  - 👃 **Nose & Cheeks** (7 shapes): Sneer, puff, squint
  - ✨ **Other** (3 shapes): Tongue out, etc.

- **Real-time Preview**: Changes are instantly visible on your 3D avatar
- **Precision Control**: 0.00 to 1.00 range with 0.01 increments
- **Search Filter**: Quickly find specific blend shapes
- **Category Collapse**: Organize your workspace

### 2. ⏱️ **Timeline & Keyframe System**
- **Keyframe-based Animation**: Record blend shape states at specific times
- **Visual Timeline**: Drag scrubber to navigate through animation
- **Keyframe Markers**: Green markers show keyframe positions
- **Interpolation**: Smooth transitions between keyframes
- **Playback Controls**:
  - ▶️ Play/Pause
  - ⏹️ Stop (return to start)
  - 🔁 Loop toggle
  - ⏱️ Adjustable duration (1-60 seconds)
  - 🎞️ FPS settings (24, 30, 60)

### 3. 🎭 **Emotion Presets**
Quick-apply presets for common emotions:
- 😊 **Happy**: Smile, squinted eyes, raised cheeks
- 😢 **Sad**: Frown, droopy eyes, raised inner brows
- 😠 **Angry**: Furrowed brows, tight lips, intense eyes
- 😲 **Surprised**: Wide eyes, raised brows, open mouth
- 😨 **Fear**: Wide eyes, tense mouth, raised inner brows
- 🤢 **Disgust**: Wrinkled nose, raised upper lip
- 😐 **Neutral**: Reset all blend shapes

### 4. 🔧 **3D Preview Controls**
- **Orbit Camera**: Click and drag to rotate view
- **Pan**: Right-click and drag to pan
- **Zoom**: Scroll wheel to zoom in/out
- **Reset Camera**: Quick reset to default view (📷 button)
- **Toggle Grid**: Show/hide reference grid (⊞ button)
- **Toggle Wireframe**: View mesh wireframe (🔲 button)

### 5. 💾 **Project Management**
- **Save Project**: Export complete project with all keyframes (.json)
- **Load Project**: Import saved projects for continued editing
- **Export Animation**: Export final animation for use in AURA (.json)
- **Auto-timestamped**: Files saved with unique timestamps

---

## How to Use

### Getting Started

1. **Access the Studio**:
   ```
   http://localhost:8000/animation-studio
   ```
   Make sure your AURA server is running!

2. **Wait for Avatar to Load**:
   - Status bar shows: 🟢 Avatar Loaded
   - Blend shape count displayed: "65 blend shapes available"

### Creating Your First Animation

#### Step 1: Set Initial Pose (Keyframe 0)
1. Move the **timeline slider** to `0.00s`
2. Adjust blend shapes to create your starting expression
3. Click **➕ Add Keyframe** to save this pose

#### Step 2: Create Additional Keyframes
1. Move the timeline slider forward (e.g., to `1.00s`)
2. Adjust blend shapes to create a different expression
3. Click **➕ Add Keyframe** again
4. Repeat for as many keyframes as needed

#### Step 3: Preview Your Animation
1. Click **▶️ Play** to see your animation
2. Use **⏸️ Pause** to stop playback
3. Click **⏹️ Stop** to return to the beginning
4. Enable **Loop** checkbox for continuous playback

#### Step 4: Refine & Edit
- Click on keyframes in the list to jump to them
- Adjust blend shapes and click **➕ Add Keyframe** to update
- Click **Delete** on keyframes you want to remove
- Scrub the timeline to preview smoothness

#### Step 5: Save Your Work
- Click **💾 Save Project** to save (.json file downloads)
- Click **⬇️ Export** to get animation-ready format

### Using Emotion Presets

Want a quick start? Use emotion presets:

1. Click any emotion preset button (e.g., "😊 Happy")
2. All relevant blend shapes are automatically set
3. Move timeline and click **➕ Add Keyframe** to save
4. Select another emotion and add another keyframe
5. Play to see the transition!

**Example Workflow - Happy to Sad Animation**:
```
1. Timeline at 0.00s → Click "😊 Happy" → Add Keyframe
2. Timeline at 2.00s → Click "😢 Sad" → Add Keyframe
3. Timeline at 4.00s → Click "😊 Happy" → Add Keyframe
4. Click Play → Watch smooth happy-to-sad-to-happy animation!
```

---

## Advanced Features

### Search & Filter
- Type in the **Search shapes...** box
- Only matching blend shapes are shown
- Great for finding specific controls like "mouth" or "eye"

### Custom Animation Duration
- Default: 5 seconds
- Change in **Animation Settings** panel
- Range: 1-60 seconds
- Timeline automatically adjusts

### FPS Settings
- **24 FPS**: Cinematic look
- **30 FPS**: Standard (default)
- **60 FPS**: Ultra-smooth

### Keyframe Management
- **Go To**: Jump timeline to keyframe position
- **Delete**: Remove unwanted keyframes
- **Select**: Click keyframe to highlight it
- Keyframes automatically sort by time

---

## File Formats

### Project File (.json)
Complete save including all keyframes and current state:
```json
{
  "version": "1.0",
  "duration": 5000,
  "keyframes": [
    {
      "time": 0,
      "shapes": {
        "mouthSmileLeft": 0.7,
        "mouthSmileRight": 0.7,
        ...
      }
    },
    ...
  ],
  "blendShapes": { ... }
}
```

### Animation Export (.json)
Optimized format for AURA integration:
```json
{
  "name": "Custom Animation",
  "duration": 5.0,
  "keyframes": [
    {
      "time": 0.0,
      "shapes": {
        "mouthSmileLeft": 0.7,
        ...
      }
    },
    ...
  ]
}
```

---

## Blend Shape Reference

### Mouth Shapes (ARKit Standard)

#### Jaw Movement
- `jawOpen`: Opens the jaw (0 = closed, 1 = fully open)
- `jawForward`: Pushes jaw forward
- `jawLeft`: Moves jaw to left
- `jawRight`: Moves jaw to right

#### Lip Shapes
- `mouthSmileLeft/Right`: Smile corners
- `mouthFrownLeft/Right`: Frown corners
- `mouthPucker`: Pucker/kiss shape
- `mouthFunnel`: "O" shape
- `mouthClose`: Close mouth tightly
- `mouthStretchLeft/Right`: Horizontal stretch
- `mouthDimpleLeft/Right`: Dimple creation
- `mouthRollLower/Upper`: Roll lip inward
- `mouthShrugLower/Upper`: Shrug lip
- `mouthPressLeft/Right`: Press lips together
- `mouthLowerDownLeft/Right`: Lower lip down
- `mouthUpperUpLeft/Right`: Upper lip up

### Eye Shapes

#### Basic Eye Control
- `eyeBlinkLeft/Right`: Close eyes (0 = open, 1 = closed)
- `eyeWideLeft/Right`: Wide open eyes
- `eyeSquintLeft/Right`: Squint eyes

#### Eye Direction (if supported)
- `eyeLookUpLeft/Right`: Look up
- `eyeLookDownLeft/Right`: Look down
- `eyeLookInLeft`: Look toward nose (left eye)
- `eyeLookOutRight`: Look away from nose (right eye)

### Brow Shapes
- `browInnerUp`: Raise inner brows (sad/worried)
- `browDownLeft/Right`: Lower brows (angry/focused)
- `browOuterUpLeft/Right`: Raise outer brows (surprised)

### Nose & Cheeks
- `noseSneerLeft/Right`: Wrinkle nose (disgust)
- `cheekPuff`: Puff out cheeks
- `cheekSquintLeft/Right`: Squint cheeks (smile)

---

## Tips & Best Practices

### 🎯 **Animation Tips**

1. **Start Simple**: Begin with 2-3 keyframes to understand the flow
2. **Use Presets**: Emotion presets give you a solid foundation
3. **Small Changes**: Subtle changes often look more natural than extreme movements
4. **Timing Matters**: Space keyframes appropriately:
   - Quick expressions: 0.2-0.5 seconds apart
   - Slow transitions: 1-3 seconds apart
5. **Preview Often**: Play your animation frequently while creating

### 🎨 **Expression Design**

1. **Layering**: Combine multiple blend shapes for complex expressions
   - Example: smile + squinted eyes + raised cheeks = genuine happiness
2. **Asymmetry**: Slight differences between left/right add realism
3. **Intensity**: Most expressions look best at 0.5-0.7, not full 1.0
4. **Transitions**: Natural expressions rarely go from 0 to 1 instantly

### 💡 **Workflow Optimization**

1. **Use Categories**: Keep only relevant categories expanded
2. **Search Feature**: Use search to quickly find specific controls
3. **Keyframe Editing**: Update existing keyframes rather than deleting/recreating
4. **Save Often**: Save project files after major changes
5. **Export Separately**: Keep project files and exports separate

---

## Keyboard Shortcuts (Future Enhancement)

*Coming soon:*
- `Space`: Play/Pause
- `Home`: Go to start
- `End`: Go to end
- `K`: Add keyframe
- `Delete`: Delete selected keyframe
- `←/→`: Navigate keyframes

---

## Integration with AURA

### Using Exported Animations

1. **Export** your animation from the studio
2. Save the `.json` file to `/assets/animations/custom/`
3. **Load in main AURA**:
   ```javascript
   // In avatar.js or main.js
   fetch('/assets/animations/custom/my_animation.json')
     .then(response => response.json())
     .then(animation => {
       // Apply animation to avatar
       animation.keyframes.forEach(kf => {
         // Your integration code here
       });
     });
   ```

### Live Preview Integration

You can also test animations directly in your AURA app by:

1. Loading the animation JSON
2. Applying blend shapes to your avatar's faceMesh
3. Using Three.js animation mixer for playback

---

## Troubleshooting

### Avatar Not Loading
- **Check**: Is `/assets/models/rpm_avatar.glb` present?
- **Solution**: Ensure your Ready Player Me avatar is in the correct location
- **Fallback**: Studio will show "🔴 Load Failed" - upload a character

### Blend Shapes Not Working
- **Check**: Does your avatar have morph targets?
- **Solution**: Use a Ready Player Me avatar with ARKit blend shapes
- **Verify**: Console should show "Found face mesh" with morph target count

### Animation Not Smooth
- **Check**: Do you have enough keyframes?
- **Solution**: Add intermediate keyframes for smoother transitions
- **Tip**: Use consistent time spacing between keyframes

### Export File Not Working
- **Check**: Browser blocking downloads?
- **Solution**: Check browser download permissions
- **Format**: Ensure .json file is valid JSON

---

## Browser Compatibility

✅ **Fully Supported**:
- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+ (macOS/iOS)

⚠️ **Limited Support**:
- Older browsers may have performance issues
- WebGL 2.0 required for best performance

---

## System Requirements

### Minimum
- **Browser**: Modern browser with WebGL 2.0
- **RAM**: 4GB
- **GPU**: Integrated graphics
- **CPU**: Dual-core processor

### Recommended
- **Browser**: Latest Chrome/Edge
- **RAM**: 8GB+
- **GPU**: Dedicated graphics card
- **CPU**: Quad-core processor
- **Display**: 1920x1080 resolution

---

## Updates & Roadmap

### Current Version: 1.0

### Planned Features (Future Updates):
- 🎹 **Keyboard shortcuts** for faster workflow
- 🔊 **Audio import** for lip-sync generation
- 📹 **Animation recording** (capture blend shape movements)
- 🎬 **Multi-track** timeline for complex animations
- 🔄 **Undo/Redo** system
- 📊 **Animation curves** for easing control
- 🎨 **Custom emotion presets** (save your own)
- 👥 **Multiple avatars** support
- ☁️ **Cloud save** functionality
- 🤝 **Collaboration** features

---

## Support & Feedback

For questions, issues, or feature requests:
- Check the main AURA project documentation
- Review the console for error messages
- Ensure your avatar has proper blend shapes

---

## License

Part of the AURA project. See main project license for details.

---

**Created with ❤️ for the AURA Virtual Friend Project**

*Last Updated: February 9, 2026*
*Version: 1.0.0*
