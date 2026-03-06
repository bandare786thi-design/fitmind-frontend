import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import "./styles.css";

import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import { ToastProvider } from "./contexts/ToastContext.jsx";
import ToastViewport from "./components/ToastViewport.jsx";

import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";
import MoodPage from "./pages/MoodPage.jsx";
import PlanPage from "./pages/PlanPage.jsx";
import WorkoutManagerPage from "./pages/WorkoutManagerPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import SmartRecommendPage from "./pages/SmartRecommendPage.jsx";

import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";

import PrivacyCenterPage from "./pages/PrivacyCenterPage.jsx";
import InsightsPage from "./pages/InsightsPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

import NotFoundPage from "./pages/NotFoundPage.jsx";

const router = createBrowserRouter(
  [
    { path: "/", element: <Navigate to="/dashboard" replace /> },

    { path: "/login", element: <LoginPage /> },
    { path: "/register", element: <RegisterPage /> },

    { path: "/verify-email", element: <VerifyEmailPage /> },
    { path: "/forgot-password", element: <ForgotPasswordPage /> },
    { path: "/reset-password", element: <ResetPasswordPage /> },

    {
      element: (
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      ),
      children: [
        { path: "/dashboard", element: <DashboardPage /> },
        { path: "/smart-recommend", element: <SmartRecommendPage /> },
        { path: "/mood", element: <MoodPage /> },
        { path: "/plan", element: <PlanPage /> },
        { path: "/workouts", element: <WorkoutManagerPage /> },
        { path: "/history", element: <HistoryPage /> },
        { path: "/reports", element: <ReportsPage /> },
        { path: "/profile", element: <ProfilePage /> },
        { path: "/onboarding", element: <OnboardingPage /> },
        { path: "/privacy", element: <PrivacyCenterPage /> },
        { path: "/insights", element: <InsightsPage /> },
        { path: "/notifications", element: <NotificationsPage /> },
        { path: "/admin", element: <AdminPage /> },
      ],
    },

    { path: "*", element: <NotFoundPage /> },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <RouterProvider router={router} />
        <ToastViewport />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
  );