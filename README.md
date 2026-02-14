# CareLink - Healthcare Dashboard

A modern healthcare web application for clinicians to easily monitor patient recovery post-operation.

![Status](https://img.shields.io/badge/status-ready-brightgreen)
![React](https://img.shields.io/badge/react-18.2.0-blue)
![Tailwind](https://img.shields.io/badge/tailwind-3.4.19-38bdf8)

## ✨ Features

- **Patient Dashboard**: View all patients with their post-operative status
- etc

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- npm 10.x or higher

### Installation

**⚠️ Important for Windows Users:**
If your project is in OneDrive, move it to a non-synced location first (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)):
```bash
# Recommended locations:
C:\Users\[username]\Documents\carelink
# OR
C:\dev\carelink
```

Then install dependencies:
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

Open your browser to `http://localhost:5173`

## 📁 Project Structure

```
carelink/
├── client/src/
│   ├── components/
│   │   ├── App.jsx              # Root component with auth context
│   │   ├── PatientCard.jsx      # Individual patient card
│   │   ├── TabSwitcher.jsx      # Tab navigation
│   │   └── pages/
│   │       └── Dashboard.jsx    # Main dashboard page
│   ├── index.jsx                # Application entry point
│   └── utilities.css            # Global styles + Tailwind
├── tailwind.config.js           # Tailwind CSS configuration
├── postcss.config.js            # PostCSS configuration
└── package.json                 # Dependencies
```

## 🎨 Technology Stack

- **React 18** - UI framework
- **Tailwind CSS 3** - Utility-first CSS framework
- **Vite 4** - Build tool and dev server
- **React Router 6** - Client-side routing

## 📱 Screenshots & Design

The UI features:
- Coral/orange gradient background
- Soft amber/cream colored patient cards
- Color-coded urgency buttons (Red/Yellow/Green)
- Smooth hover animations
- Fully responsive grid layout

### Responsive Breakpoints
- **Mobile (< 640px)**: 1 column layout
- **Tablet (640-1024px)**: 2 column layout
- **Desktop (> 1024px)**: 3 column layout

## 🔧 Customization

### Adding New Patients

Edit the `patientsData` array in `client/src/components/pages/Dashboard.jsx`:

```javascript
const patientsData = [
  {
    id: 1,
    name: "Patient Name",
    avatar: "https://example.com/avatar.jpg",
    operation: "Surgery Type",
    symptoms: "Symptom list",
    dischargeDate: "Date",
    urgency: "Urgent|Monitor|Minimal",
    aiSummary: "Optional AI summary" // Only for urgent cases
  },
  // ... more patients
];
```

### Modifying Colors

Update the Tailwind configuration in `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      'coral': { 500: '#FA8072' },
      'peach': '#FFEAA7',
      // Add your colors
    }
  }
}
```

### Changing Layout

Modify grid classes in `Dashboard.jsx`:
```javascript
// Default: 1 → 2 → 3 columns
className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"

// Example: 1 → 2 → 4 columns
className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6"
```

## 📚 Documentation

Comprehensive documentation is available:

- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Complete project overview
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Component structure & visual diagrams
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Detailed implementation notes
- **[TESTING.md](TESTING.md)** - Testing checklist and guidelines
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Windows EPERM error solutions
- **[COMPONENT_GUIDE.js](COMPONENT_GUIDE.js)** - Component API reference
- **[SETUP.md](SETUP.md)** - Quick setup guide

## 🐛 Troubleshooting

### Common Issues

**EPERM Error on Windows**
- Move project out of OneDrive
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions

**Tailwind styles not working**
- Ensure Tailwind is installed: `npm install -D tailwindcss postcss autoprefixer`
- Restart dev server

**Port 5173 already in use**
- Change port in `vite.config.js`
- Or kill process using port 5173

## 🎯 Current Status

### ✅ Implemented (UI Only)
- Patient cards display with all information
- Tab switching between Patients/Analytics
- Responsive grid layout
- Color-coded urgency levels
- Hover animations and effects
- Clean, modern design

### ⏳ Not Yet Implemented
- Button functionality (Contact, Urgency actions)
- Analytics tab content
- Backend API integration
- Real-time patient data
- User authentication
- Search/filter functionality

*Note: Current implementation is UI-only as requested. Buttons are non-functional placeholders.*

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
npm start        # Start backend server (nodemon)
```

### Code Quality

- ✅ No linter errors
- ✅ No syntax errors
- ✅ Clean, readable code
- ✅ Proper React patterns (hooks, functional components)
- ✅ Reusable components
- ✅ Well-commented

## 🔮 Future Enhancements

Potential features to add:
- Connect to backend API for real patient data
- Implement Contact button functionality
- Build out Analytics dashboard
- Add patient detail views
- Implement search and filtering
- Add patient data management (CRUD)
- Real-time updates with WebSockets
- Export/print patient reports
- Notification system for urgent cases

## 👥 Component Overview

```
App
└── Dashboard
    ├── TabSwitcher (navigation)
    └── PatientCard (multiple instances)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed component diagrams.

## 🎨 Design System

### Colors
- **Background**: Orange/Coral gradient
- **Cards**: Amber/Cream
- **Urgent**: Red (#EF4444)
- **Monitor**: Yellow (#FBBF24)
- **Minimal**: Green (#10B981)
- **Contact**: Dark Gray (#1F2937)

### Typography
- Font Family: Roboto (can be customized in `utilities.css`)
- Headings: Bold, larger sizes
- Body: Regular weight, good contrast

## 📝 Notes

- Sample patient avatars use Unsplash (requires internet)
- Replace with actual patient photos when available
- All button actions are currently UI-only
- Analytics tab shows placeholder message

## 📄 License

ISC

## 🙏 Acknowledgments

- Built with React and Tailwind CSS
- Based on weblab-skeleton template
- Designed for MIT 25-26 healthcare project

---

**Built with ❤️ for better patient care**

*Last Updated: February 14, 2026*
