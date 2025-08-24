# Tallman Business Intelligence Dashboard

This is a comprehensive business intelligence dashboard that provides real-time key performance indicators (KPIs) and business metrics for Tallman Equipment, a tool and equipment distribution company. The application features a dynamic and responsive interface, AI-powered data simulation, and a robust role-based authentication system.

## Features

- **Real-time KPI Tracking**: Monitor key business metrics at a glance, including sales, orders, revenue, and inventory.
- **Interactive Charts**: Visualize data across various business segments with interactive bar charts.
- **Dual Operating Modes**:
    - **Demo Mode**: Utilizes a local LLM (via Ollama) to generate realistic, simulated data for demonstration and testing purposes.
    - **Production Mode**: Simulates connections to live production databases (P21 & POR) to fetch and display real-world data.
- **Secure Authentication**: Features an LDAP-ready login system with local user authorization and role-based access control.
- **User Management**: An admin-only interface to manage authorized users and their permission levels (Admin, User).
- **Advanced Admin Tools**: Includes a direct SQL Query Tool for admins to interact with the simulated databases and manage dashboard metrics.
- **Theming**: Supports both light and dark modes for user comfort.

## Architecture

The application is a single-page application (SPA) built with React and TypeScript.

- **Frontend**: Built with React, utilizing hooks for state management and functional components.
- **Routing**: Handled by `react-router-dom` for seamless navigation between the Dashboard, Admin, and User Management pages.
- **UI**: Styled with Tailwind CSS for a modern, responsive, and clean design.
- **Data Visualization**: Charts are rendered using the `recharts` library.
- **AI Simulation**: Data simulation in Demo Mode is powered by a local Large Language Model (LLM) through an Ollama endpoint.
- **State Management**: Global state for theming, application mode, and authentication is managed via React Context.

## Authentication and Authorization

The application employs a two-tiered security model:

1.  **Authentication (Simulated LDAP)**: The login page is designed to authenticate credentials against a corporate LDAP server. For this version, the LDAP interaction is simulated, allowing for development and testing without a live LDAP connection. It validates user credentials before proceeding.

2.  **Authorization (Local User List)**: Upon successful authentication, the application checks the user against an internal list of authorized users. This list is managed by administrators within the app. Each user is assigned a role (`admin` or `user`) which determines their access level.
    -   **Admin**: Full access to all features, including the main dashboard, the admin panel for metric configuration, the SQL query tool, and the user management page.
    -   **User**: Access is restricted to viewing the main operational dashboard.

This dual system ensures that only valid, explicitly authorized personnel can access the company's sensitive data.

## Setup and Installation

1.  **Prerequisites**:
    -   A running [Ollama](https://ollama.com/) instance.
    -   An installed Ollama model (e.g., `llama3`). The application is configured to use `llama3` by default. You can pull it by running:
        ```bash
        ollama pull llama3
        ```

2.  **Running the Application**:
    -   The application is self-contained within the `index.html` file.
    -   Simply open the `index.html` file in a modern web browser to launch the dashboard.

## Initial Login

Upon first launch, you can log in with the pre-configured administrator account:

-   **Username**: `BobM`
-   **Password**: (any password will work with the simulated LDAP)

Once logged in as an administrator, you can navigate to the **Admin** page and then to the **User Management** page to add more users and manage their roles.
