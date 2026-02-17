'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'patient', // default role
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Login to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Login As
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'patient' })}
                className={`py-2 px-4 rounded-lg font-medium transition ${
                  formData.role === 'patient'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'doctor' })}
                className={`py-2 px-4 rounded-lg font-medium transition ${
                  formData.role === 'doctor'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Doctor
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'admin' })}
                className={`py-2 px-4 rounded-lg font-medium transition ${
                  formData.role === 'admin'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Enter your email"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Enter your password"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          {/* Signup Link */}
          {formData.role !== 'admin' && (
            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <a href="/Signup" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign up
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}