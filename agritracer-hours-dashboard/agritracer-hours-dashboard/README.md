# Agritracer Hours Dashboard

A comprehensive dashboard to visualize and analyze metrics from the `rpt_horas_agritracer` table in Supabase, featuring real-time charts and detailed data views.

## Features

- **Real-time Analytics**: Visualize worker attendance and hours.
- **Worker Details**: Detailed history of the last 15 days for each worker.
- **Authentication**: Secure login system using Supabase Auth.
- **Responsive Design**: Built with React, Tailwind CSS, and shadcn/ui.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Supabase project with the required tables/views.

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd agritracer-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

### Vercel

1. Push your code to GitHub.
2. Connect your GitHub repository to Vercel.
3. Add the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the Vercel project settings.
4. Vercel will automatically detect the Vite project and deploy it.

## Built With

- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/)
- [Lucide React](https://lucide.dev/)
- [Recharts](https://recharts.org/)
