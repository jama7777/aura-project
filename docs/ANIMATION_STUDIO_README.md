# 🎭 AURA Blend Shape Animation Studio

## Quick Start

Your custom blend shape animation software is ready!

### Access the Studio

1. **Make sure AURA server is running**:
   ```bash
   cd /Users/indra/Documents/aura-project
   source venv/bin/activate
   uvicorn server:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Open in your browser**:
   ```
   http://localhost:8000/animation-studio
   ```

## What is This?

A professional web-based tool for creating custom facial animations using blend shapes. You can:

✅ **Control 65+ Blend Shapes** - Mouth, eyes, brows, jaw, nose, cheeks
✅ **Create Keyframe Animations** - Timeline-based animation editing
✅ **Real-time 3D Preview** - See changes instantly on your avatar
✅ **Emotion Presets** - Quick-start with happy, sad, angry, etc.
✅ **Save & Export** - Save projects and export animations as JSON
✅ **Import & Edit** - Load and modify existing animations

## Key Features

| Feature | Description |
|---------|-------------|
| **Blend Shape Controls** | Individual sliders for each facial feature (0.00 - 1.00) |
| **Timeline** | Visual timeline with scrubber and keyframe markers |
| **Keyframes** | Add, edit, delete keyframes at any time point |
| **Playback** | Play, pause, stop, loop animations |
| **Presets** | 7 emotion presets for quick starting points |
| **Export** | Save as JSON for use in AURA or other applications |

## Quick Tutorial

### Create Your First Animation in 60 Seconds:

1. **Access**: Open `http://localhost:8000/animation-studio`
2. **Wait**: Avatar loads (you'll see "🟢 Avatar Loaded")
3. **Preset**: Click "😊 Happy" preset button
4. **Keyframe**: Click "➕ Add Keyframe" (at 0.00s)
5. **Move**: Drag timeline slider to 2.00s
6. **Preset**: Click "😢 Sad" preset button
7. **Keyframe**: Click "➕ Add Keyframe" again
8. **Play**: Click ▶️ to see your happy-to-sad animation!

That's it! You've created your first animation.

## File Structure

```
/web/
  ├── animation_studio.html          # Main HTML page
  └── /static/
      ├── /css/
      │   └── animation_studio.css   # Premium dark theme styling
      └── /js/
          └── animation_studio.js    # Full animation engine
```

## Documentation

Full documentation available at:
```
/docs/ANIMATION_STUDIO.md
```

Includes:
- Complete feature list
- Detailed usage instructions
- Blend shape reference guide
- Tips & best practices
- Troubleshooting
- Integration guide

## Screenshots

### Main Interface:
- Left: Blend Shape Controls (organized by category)
- Center: 3D Avatar Preview with emotion presets
- Right: Timeline, Keyframes, and Animation Settings

### Categories:
- 👄 Mouth (32 shapes)
- 👁️ Eyes (12 shapes)
- 🤨 Brows (7 shapes)
- 🦷 Jaw (4 shapes)
- 👃 Nose & Cheeks (7 shapes)
- ✨ Other (3 shapes)

## Supported File Formats

### Project Files (.json)
Complete save including:
- All keyframes
- Current blend shape states
- Animation settings (duration, FPS)

### Animation Exports (.json)
Optimized format for AURA:
- Keyframe sequence
- Blend shape values
- Timing information

## Browser Requirements

✅ Chrome 90+ (Recommended)
✅ Edge 90+
✅ Firefox 88+
✅ Safari 14+

Requires WebGL 2.0 support.

## Tips

1. **Start with Presets** - Use emotion presets as a foundation
2. **Small Changes** - Subtle movements look more natural
3. **Preview Often** - Play frequently while creating
4. **Save Regularly** - Save project files after major changes
5. **Search Feature** - Use search box to find specific blend shapes quickly

## Troubleshooting

**Avatar not showing?**
- Ensure `/assets/models/rpm_avatar.glb` exists
- Check browser console for errors
- Refresh the page

**Blend shapes not working?**
- Your avatar needs ARKit blend shapes (morph targets)
- Use a Ready Player Me avatar for best results

**Animation not smooth?**
- Add more keyframes between major changes
- Check FPS settings (try 60 FPS)

## Next Steps

1. ✅ Access the studio at `http://localhost:8000/animation-studio`
2. ✅ Create a simple 2-keyframe animation
3. ✅ Export it as JSON
4. ✅ Read full docs in `/docs/ANIMATION_STUDIO.md`
5. ⬜ Integrate exported animations into AURA

## Version

**Version**: 1.0.0
**Release Date**: February 9, 2026
**Status**: Production Ready ✅

---

**Built with**:
- Three.js (3D rendering)
- Vanilla JavaScript (no framework dependencies)
- Modern CSS (premium dark theme)
- HTML5 (semantic structure)

**Part of the AURA Virtual Friend Project**
