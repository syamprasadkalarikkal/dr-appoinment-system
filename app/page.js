'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const userRole = localStorage.getItem('userRole');

    if (userRole) {
      // Redirect to appropriate dashboard based on role
      if (userRole === 'admin') {
        router.push('/Admin');
      } else if (userRole === 'doctor') {
        router.push('/Doctor');
      } else if (userRole === 'patient') {
        router.push('/Patient');
      }
    } else {
      // No user logged in, show the landing page
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-900 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-400 mx-auto mb-4"></div>
          <p className="text-teal-200 text-lg">Loading AMRT System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative flex flex-col overflow-hidden bg-gray-900">
      {/* Background image & overlay matching Symptom Checker */}
      <img
        src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=80"
        alt="Medical Background"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-teal-900/90 via-teal-800/80 to-gray-900/95" />

      {/* Navigation Bar */}
      <nav className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/amrt-logo.png" alt="AMRT Logo" className="h-12 w-auto object-contain" />

        </div>
        <div className="flex gap-4">
          <Link href="/Login" className="px-5 py-2 text-teal-100 hover:text-white font-medium transition-colors">
            Log In
          </Link>
          <Link href="/Signup" className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-lg shadow-lg shadow-teal-500/30 transition-all transform hover:scale-105">
            Sign Up
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center p-6 lg:p-12 gap-12 max-w-7xl mx-auto w-full">
        {/* Left Column: Hero Text */}
        <div className="flex-1 text-center lg:text-left flex flex-col items-center lg:items-start">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-2 mb-6 shadow-sm">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-teal-100 text-sm font-semibold tracking-wide">Next-Generation Healthcare</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Intelligent Care, <br className="hidden lg:block" />
            <span className="text-teal-400">Simplified.</span>
          </h1>

          <p className="text-lg text-teal-100/90 leading-relaxed mb-10 max-w-2xl text-center lg:text-left">
            The AMRT System bridges the gap between doctors and patients. Experience unified healthcare with AI symptom checking, real-time consultations, and seamless appointment booking.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <Link href="/Signup" className="px-8 py-3.5 bg-teal-500 hover:bg-teal-400 text-white text-lg font-bold rounded-xl shadow-xl shadow-teal-500/20 transition-all transform hover:-translate-y-1 text-center">
              Get Started
            </Link>
            <Link href="/Login" className="px-8 py-3.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-lg font-bold rounded-xl transition-all text-center">
              Find Doctors
            </Link>
          </div>
        </div>

        {/* Right Column: Features Glassmorphism Panels */}
        <div className="flex-1 w-full max-w-lg lg:ml-auto">
          <div className="grid gap-4">
            {/* Feature 1 */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/15 transition-colors transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-teal-500/20 rounded-xl border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">AI Symptom Checker</h3>
                <p className="text-teal-100/80 text-sm leading-relaxed">Describe your symptoms to our intelligent AI for instant preliminary assessment and urgency guidance.</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/15 transition-colors transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">Real-Time Chat</h3>
                <p className="text-teal-100/80 text-sm leading-relaxed">Consult with approved doctors directly through our secure, real-time messaging system.</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/15 transition-colors transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">Easy Appointments</h3>
                <p className="text-teal-100/80 text-sm leading-relaxed">Find specialists near you, view their credentials, and book appointments with just a few clicks.</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/15 transition-colors transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">Secure & Private</h3>
                <p className="text-teal-100/80 text-sm leading-relaxed">Your medical data and communications are always private, secure, and accessible only to you.</p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 flex items-start gap-4 hover:bg-white/15 transition-colors transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-rose-500/20 rounded-xl border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">Find Doctors Nearby</h3>
                <p className="text-teal-100/80 text-sm leading-relaxed">Instantly locate available specialists in your exact geographic area based on real-time proximity.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Disclaimer footer */}
      <footer className="relative z-10 w-full text-center py-5 border-t border-white/10 bg-black/20 backdrop-blur-sm mt-auto">
        <p className="text-teal-200/60 text-xs sm:text-sm px-6">
          © {new Date().getFullYear()} AMRT System. This platform provides digital healthcare facilitation. For medical emergencies, please call your local emergency services immediately.
        </p>
      </footer>
    </div>
  );
}