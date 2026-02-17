'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { sendDoctorApprovalNotification } from '@/lib/notificationService';

export default function Signup() {
  const router = useRouter();
  const [role, setRole] = useState('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Create Account</h1>
          <p className="text-gray-600">Join our healthcare platform</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Register As
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setRole('patient')}
                className={`py-3 px-4 rounded-lg font-medium transition ${
                  role === 'patient'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={`py-3 px-4 rounded-lg font-medium transition ${
                  role === 'doctor'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Doctor
              </button>
            </div>
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={commonData.name}
                onChange={handleCommonChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                value={commonData.phone}
                onChange={handleCommonChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="+91 1234567890"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={commonData.email}
              onChange={handleCommonChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="your.email@example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={commonData.password}
                onChange={handleCommonChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Min. 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={commonData.confirmPassword}
                onChange={handleCommonChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Re-enter password"
              />
            </div>
          </div>

          {/* Patient Specific Fields */}
          {role === 'patient' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address *
                </label>
                <textarea
                  name="address"
                  value={patientData.address}
                  onChange={handlePatientChange}
                  required
                  rows="2"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Enter your full address"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="25"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender *
                  </label>
                  <select
                    name="gender"
                    value={patientData.gender}
                    onChange={handlePatientChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Blood Group *
                  </label>
                  <select
                    name="bloodGroup"
                    value={patientData.bloodGroup}
                    onChange={handlePatientChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">Select</option>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  name="dob"
                  value={patientData.dob}
                  onChange={handlePatientChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </>
          )}

          {/* Doctor Specific Fields */}
          {role === 'doctor' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Qualification *
                  </label>
                  <input
                    type="text"
                    name="qualification"
                    value={doctorData.qualification}
                    onChange={handleDoctorChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="MBBS, MD"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Doctor ID *
                  </label>
                  <input
                    type="text"
                    name="doctorId"
                    value={doctorData.doctorId}
                    onChange={handleDoctorChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="DOC12345"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Specialization *
                </label>
                <input
                  type="text"
                  name="specialization"
                  value={doctorData.specialization}
                  onChange={handleDoctorChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Cardiologist, Neurologist, etc."
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Doctor accounts require admin approval before full access is granted.
                </p>
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>

          {/* Login Link */}
          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <a href="/Login" className="text-blue-600 hover:text-blue-700 font-medium">
              Login
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}