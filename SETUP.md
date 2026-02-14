# Quick Setup Guide

## Installation Steps

1. **Close any running processes** (dev servers, terminals, etc.)

2. **Install dependencies**:
   ```bash
   npm install
   ```

   If you get permission errors on Windows:
   - Close VS Code/Cursor completely
   - Disable any antivirus temporarily
   - Run Command Prompt as Administrator and navigate to the project folder
   - Try: `npm install --legacy-peer-deps`

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** to the URL shown in the terminal (usually http://localhost:5173)

## Troubleshooting

### EPERM errors during npm install
- This is a Windows file locking issue
- Close all editors and terminals
- Try running as Administrator
- If it persists, restart your computer

### Tailwind styles not showing
- Make sure all files were saved
- Try stopping the dev server (Ctrl+C) and starting again
- Clear browser cache

### Port already in use
- Change the port in `vite.config.js`
- Or stop any other processes using port 5173

## Project Overview

The CareLink dashboard shows patient recovery data in a beautiful, responsive UI:

- **Main page**: Shows patient cards with urgency indicators
- **Tab switcher**: Toggle between Patients and Analytics
- **Responsive**: Works on desktop, tablet, and mobile

All components are in `client/src/components/` for easy customization!
