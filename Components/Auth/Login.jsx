'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'patient', // default role
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Protect route: Redirect if already logged in
  useEffect(() => {
    const role = localStorage.getItem('userRole');
    if (role === 'admin') router.push('/Admin');
    else if (role === 'doctor') router.push('/Doctor');
    else if (role === 'patient') router.push('/Patient');
  }, [router]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Authenticate user with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Fetch user role from database
      const userData = await getUserRole(authData.user.id);

      if (!userData) {
        setError('User profile not found');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Verify role matches selected role
      if (userData.role !== formData.role) {
        setError(`This account is registered as ${userData.role}, not ${formData.role}`);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Store user data in localStorage
      localStorage.setItem('userRole', userData.role);
      localStorage.setItem('userId', authData.user.id);

      // Redirect based on role
      if (userData.role === 'admin') {
        localStorage.setItem('isAdmin', 'true');
        router.push('/Admin');
      } else if (userData.role === 'doctor') {
        localStorage.setItem('isApproved', userData.is_approved);
        router.push('/Doctor');
      } else if (userData.role === 'patient') {
        localStorage.setItem('isApproved', userData.is_approved);
        router.push('/Patient');
      }

    } catch (err) {
      setError('An error occurred during login');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 bg-gray-900 overflow-hidden">
      {/* Background image & overlay matching Home/Symptom Checker */}
      <img
        src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=80"
        alt="Medical Background"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-teal-900/90 via-teal-800/80 to-gray-900/95" />

      {/* Navigation Bar (Optional for Auth pages, just the logo for branding) */}
      <nav className="absolute top-0 left-0 w-full px-6 py-4 flex items-center justify-between z-10">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img src="/amrt-logo.png" alt="AMRT Logo" className="h-10 w-auto object-contain" />

        </Link>
      </nav>

      {/* Login Card inside Glassmorphism container */}
      <div className="relative z-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-teal-100/80">Login to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-teal-100 mb-2">
              Login As
            </label>
            <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
              {['patient', 'doctor', 'admin'].map((roleType) => (
                <button
                  key={roleType}
                  type="button"
                  onClick={() => setFormData({ ...formData, role: roleType })}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${formData.role === roleType
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                    : 'text-teal-100/70 hover:text-white hover:bg-white/10'
                    }`}
                >
                  {roleType}
                </button>
              ))}
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-teal-100 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-teal-100/40 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition"
              placeholder="Enter your email"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-teal-100 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-teal-100/40 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition"
              placeholder="Enter your password"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-teal-500 hover:bg-teal-400 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Logging in...
              </span>
            ) : (
              'Login'
            )}
          </button>

          {/* Signup Link */}
          {formData.role !== 'admin' && (
            <p className="text-center text-sm text-teal-100/80">
              Don't have an account?{' '}
              <a href="/Signup" className="text-teal-400 hover:text-teal-300 font-bold transition-colors">
                Sign up
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}