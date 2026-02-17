'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

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
      // No user logged in, redirect to login page
      router.push('/Login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 text-lg">Loading...</p>
      </div>
    </div>
  );
}