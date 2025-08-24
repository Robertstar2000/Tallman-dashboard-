# Tallman Business Intelligence Dashboard

This is a comprehensive business intelligence dashboard that provides real-time key performance indicators (KPIs) and business metrics for Tallman Equipment, a tool and equipment distribution company. The application features a dynamic and responsive interface, AI-powered data simulation, and a robust role-based authentication system.

## Features

-   **Real-time KPI Tracking**: Monitor key business metrics at a glance, including sales, orders, revenue, and inventory.
-   **Interactive Charts**: Visualize data across various business segments with a suite of interactive charts powered by `recharts`.
-   **Dual Operating Modes**:
    -   **Demo Mode**: Utilizes an AI backend to generate realistic, simulated data. The system is configured to use the **Google Gemini API** (`gemini-2.5-flash`) when an API key is present. If no key is found, it gracefully falls back to a local Ollama instance.
    -   **Production Mode**: Simulates connections to live production databases (P21 & POR) to demonstrate how the dashboard would behave in a production environment, including handling connection failures.
-   **Secure Authentication**: Features a simulated LDAP login system with local user authorization and role-based access control.
-   **User Management**: An admin-only interface to manage authorized users and their permission levels (Admin, User).
-   **Advanced Admin Tools**: Includes a direct SQL Query Tool for admins to test SQL queries against the AI backend and a comprehensive data management table to edit metric definitions live.
-   **Theming**: Supports both light and dark modes, with the setting persisted in `localStorage`.

## Architecture

The application is a single-page application (SPA) built with React and TypeScript.

-   **Frontend**: Built with modern React (v19+), utilizing hooks for state management and functional components.
-   **Routing**: Handled by `react-router-dom` in `MemoryRouter` mode for seamless navigation without affecting the browser's history stack.
-   **UI**: Styled with Tailwind CSS for a modern, responsive, and clean design.
-   **AI Integration**: The `geminiService.ts` module handles all interactions with the AI backend.
    -   **Primary**: Uses the `@google/genai` library to query the Gemini API for SQL execution simulation and connection tests.
    -   **Fallback**: If the `API_KEY` environment variable is not set, it falls back to a local Ollama endpoint (`http://localhost:11434/api/generate`) using the `llama3` model.
-   **State Management**: Global state for theming, application mode, and authentication is managed via React Context. Dashboard data state is managed within the `useDashboardData` custom hook.
-   **Data Persistence**: User lists and dashboard metric configurations are persisted in the browser's `localStorage`. User sessions are stored in `sessionStorage`.

## Authentication and Authorization

The application employs a two-tiered security model:

1.  **Authentication (Simulated LDAP)**: The login page is designed to authenticate credentials against a corporate LDAP server. In this implementation, the interaction is simulated in `authService.ts`. It validates that a username and password were provided, mimicking a successful external authentication.

2.  **Authorization (Local User List)**: Upon successful authentication, the application checks the user against an internal list of authorized users stored in `localStorage`. This list is managed by administrators within the app's User Management page. Each user is assigned a role (`admin` or `user`) which determines their access level.

This dual system ensures that only valid, explicitly authorized personnel can access the application's sensitive data views. A developer backdoor is also included for easy access during development.

## Setup and Running

### Prerequisites

The application can run using one of two AI backends:

1.  **Google Gemini API (Recommended)**:
    -   An `API_KEY` for the Gemini API must be available as an environment variable (`process.env.API_KEY`). The application is designed to pick this up automatically if present.

2.  **Ollama (Fallback)**:
    -   A running [Ollama](https://ollama.com/) instance.
    -   The `llama3` model must be installed. You can pull it by running:
        ```bash
        ollama pull llama3
        ```

### Running the Application

The application is a self-contained static web app. No build step is required.

-   Simply open the `index.html` file in a modern web browser that supports ES Modules.

## Initial Login

Upon first launch, you can log in with the pre-configured administrator account:

-   **Username**: `BobM`
-   **Password**: (any password will work with the simulated LDAP)

A developer backdoor is also available:
-   **Username**: `Robertstar`
-   **Password**: `Rm2214ri#`

Once logged in as an administrator, navigate to the **Admin** page and then to the **User Management** page to add more users and manage their roles.
