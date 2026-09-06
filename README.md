# Production OEE Tracker

A web-based Overall Equipment Effectiveness (OEE) and production tracking dashboard integrated with Supabase for real-time cloud data storage.

---

## Features

- **Production Logging**: Record machine operations, shifts, and output quantities.
- **OEE Metrics**: Track availability, performance, and quality indicators.
- **Supabase Integration**: Direct cloud database synchronization for persistent entry tracking.
- **Local Fallback**: Client-side storage support when offline.

---

## Project Structure

```text
├── production oee/
│   └── tracker/
│       ├── css/          # Application styling
│       ├── js/           # App logic and database handlers
│       ├── index.html    # Main dashboard interface
│       └── schema.sql    # Supabase database schema and policies
└── README.md
