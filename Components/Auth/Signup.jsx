'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendDoctorApprovalNotification } from '@/lib/notificationService';

export default function Signup() {
  const router = useRouter();
  const [role, setRole] = useState('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Protect route: Redirect if already logged in
  useEffect(() => {
    const userRole = localStorage.getItem('userRole');
    if (userRole === 'admin') router.push('/Admin');
    else if (userRole === 'doctor') router.push('/Doctor');
    else if (userRole === 'patient') router.push('/Patient');
  }, [router]);

  // Common fields
  const [commonData, setCommonData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    phone: '',
  });

  // Patient specific fields
  const [patientData, setPatientData] = useState({
    address: '',
    age: '',
    gender: '',
    dob: '',
    bloodGroup: '',
  });

  // Doctor specific fields
  const [doctorData, setDoctorData] = useState({
    qualification: '',
    specialization: '',
    doctorId: '',
  });

  const handleCommonChange = (e) => {
    setCommonData({ ...commonData, [e.target.name]: e.target.value });
  };

  const handlePatientChange = (e) => {
    setPatientData({ ...patientData, [e.target.name]: e.target.value });
  };

  const handleDoctorChange = (e) => {
    setDoctorData({ ...doctorData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validate passwords match
    if (commonData.password !== commonData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (commonData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: commonData.email,
        password: commonData.password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Step 2: Create user profile in users table
      const userId = authData.user.id;

      let userProfile = {
        id: userId,
        email: commonData.email,
        name: commonData.name,
        phone: commonData.phone,
        role: role,
        is_approved: role === 'patient', // Patients auto-approved, doctors need approval
        created_at: new Date().toISOString(),
      };

      // Add role-specific data
      if (role === 'patient') {
        userProfile = {
          ...userProfile,
          address: patientData.address,
          age: parseInt(patientData.age),
          gender: patientData.gender,
          dob: patientData.dob,
          blood_group: patientData.bloodGroup,
        };
      } else if (role === 'doctor') {
        userProfile = {
          ...userProfile,
          qualification: doctorData.qualification,
          specialization: doctorData.specialization,
          doctor_id: doctorData.doctorId,
        };
      }

      // Insert into users table
      const { error: insertError } = await supabase
        .from('users')
        .insert([userProfile]);

      if (insertError) {
        setError('Failed to create user profile: ' + insertError.message);
        setLoading(false);
        return;
      }

      // Send notification to admin if doctor signup
      if (role === 'doctor') {
        try {
          await sendDoctorApprovalNotification(userProfile);
        } catch (notificationErr) {
          console.error('Failed to send notification, but user registered:', notificationErr);
        }
      }

      // Success message based on role
      if (role === 'doctor') {
        setSuccess('Registration successful! Your account is pending admin approval. You can login once approved.');
      } else {
        setSuccess('Registration successful! Redirecting to login...');
        setTimeout(() => {
          router.push('/Login');
        }, 2000);
      }

    } catch (err) {
      setError('An error occurred during signup');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-teal-100/40 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition";
  const selectClasses = "w-full px-4 py-2 bg-[#1a252f] lg:bg-white/5 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition appearance-none [&>option]:bg-gray-800";

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 py-12 bg-gray-900 overflow-hidden">
      {/* Background image & overlay matching Home/Symptom Checker */}
      <img
        src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1920&q=80"
        alt="Medical Background"
        className="absolute inset-0 w-full h-full object-cover fixed"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-teal-900/90 via-teal-800/80 to-gray-900/95 fixed" />

      {/* Navigation Bar Branding */}
      <nav className="absolute top-0 left-0 w-full px-6 py-4 flex items-center justify-between z-10">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <img src="/amrt-logo.png" alt="AMRT Logo" className="h-10 w-auto object-contain" />

        </Link>
      </nav>

      {/* Signup Card inside Glassmorphism container */}
      <div className="relative z-10 w-full max-w-2xl bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-10 my-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-teal-100/80">Join our next-generation healthcare platform</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-teal-100 mb-2">
              Register As
            </label>
            <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10 max-w-md mx-auto">
              {['patient', 'doctor'].map((roleType) => (
                <button
                  key={roleType}
                  type="button"
                  onClick={() => setRole(roleType)}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${role === roleType
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                    : 'text-teal-100/70 hover:text-white hover:bg-white/10'
                    }`}
                >
                  {roleType}
                </button>
              ))}
            </div>
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-teal-100 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={commonData.name}
                onChange={handleCommonChange}
                required
                className={inputClasses}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-teal-100 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                value={commonData.phone}
                onChange={handleCommonChange}
                required
                className={inputClasses}
                placeholder="+91 1234567890"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-teal-100 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={commonData.email}
              onChange={handleCommonChange}
              required
              className={inputClasses}
              placeholder="your.email@example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-teal-100 mb-2">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={commonData.password}
                onChange={handleCommonChange}
                required
                className={inputClasses}
                placeholder="Min. 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-teal-100 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={commonData.confirmPassword}
                onChange={handleCommonChange}
                required
                className={inputClasses}
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {/* Patient Specific Fields */}
          {role === 'patient' && (
            <div className="space-y-5 pt-4 border-t border-white/10">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Patient Details
              </h3>
              <div>
                <label className="block text-sm font-medium text-teal-100 mb-2">
                  Address *
                </label>
                <textarea
                  name="address"
                  value={patientData.address}
                  onChange={handlePatientChange}
                  required
                  rows="2"
                  className={inputClasses}
                  placeholder="Enter your full address"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-teal-100 mb-2">
                    Age *
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={patientData.age}
                    onChange={handlePatientChange}
                    required
                    min="1"
                    max="120"
                    className={inputClasses}
                    placeholder="25"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-teal-100 mb-2">
                    Gender *
                  </label>
                  <select
                    name="gender"
                    value={patientData.gender}
                    onChange={handlePatientChange}
                    required
                    className={selectClasses}
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-teal-100 mb-2">
                    Blood Group *
                  </label>
                  <select
                    name="bloodGroup"
                    value={patientData.bloodGroup}
                    onChange={handlePatientChange}
                    required
                    className={selectClasses}
                  >
                    <option value="">Select Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-teal-100 mb-2">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  name="dob"
                  value={patientData.dob}
                  onChange={handlePatientChange}
                  required
                  className={inputClasses + " [color-scheme:dark]"}
                />
              </div>
            </div>
          )}

          {/* Doctor Specific Fields */}
          {role === 'doctor' && (
            <div className="space-y-5 pt-4 border-t border-white/10">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                Professional Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-teal-100 mb-2">
                    Qualification *
                  </label>
                  <input
                    type="text"
                    name="qualification"
                    value={doctorData.qualification}
                    onChange={handleDoctorChange}
                    required
                    className={inputClasses}
                    placeholder="MBBS, MD"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-teal-100 mb-2">
                    Doctor ID *
                  </label>
                  <input
                    type="text"
                    name="doctorId"
                    value={doctorData.doctorId}
                    onChange={handleDoctorChange}
                    required
                    className={inputClasses}
                    placeholder="DOC12345"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-teal-100 mb-2">
                  Specialization *
                </label>
                <input
                  type="text"
                  name="specialization"
                  value={doctorData.specialization}
                  onChange={handleDoctorChange}
                  required
                  className={inputClasses}
                  placeholder="Cardiologist, Neurologist, etc."
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 mt-4">
                <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-amber-200/90 leading-relaxed">
                  Doctor accounts require admin approval before full access to the portal is granted. You will be notified once reviewed.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-sm">
              {success}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-4 text-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Creating Account...
              </span>
            ) : (
              'Sign Up'
            )}
          </button>

          {/* Login Link */}
          <p className="text-center text-sm text-teal-100/80 pt-2">
            Already have an account?{' '}
            <a href="/Login" className="text-teal-400 hover:text-teal-300 font-bold transition-colors">
              Login
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}