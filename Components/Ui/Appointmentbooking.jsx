'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AppointmentBooking({ doctor, patientId, onBack, onSuccess }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState([]);

  const timeOfDay = ['Morning', 'Afternoon', 'Evening'];
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('Afternoon');

  useEffect(() => {
    fetchAvailableDates();
  }, [doctor.id, currentMonth]);

  useEffect(() => {
    if (selectedDate) {
      fetchTimeSlots();
    }
  }, [selectedDate, selectedTimeOfDay]);

  const fetchAvailableDates = async () => {
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('time_slots')
        .select('date')
        .eq('doctor_id', doctor.id)
        .eq('is_available', true)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      if (error) throw error;

      const dates = [...new Set(data.map(slot => slot.date))];
      setAvailableDates(dates);

      // Auto-select first available date
      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch (error) {
      console.error('Error fetching available dates:', error);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      setLoading(true);

      let timeFilter = {};
      if (selectedTimeOfDay === 'Morning') {
        timeFilter = { gte: '06:00:00', lt: '12:00:00' };
      } else if (selectedTimeOfDay === 'Afternoon') {
        timeFilter = { gte: '12:00:00', lt: '17:00:00' };
      } else {
        timeFilter = { gte: '17:00:00', lt: '22:00:00' };
      }

      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('doctor_id', doctor.id)
        .eq('date', selectedDate)
        .eq('is_available', true)
        .gte('start_time', timeFilter.gte)
        .lt('start_time', timeFilter.lt)
        .order('start_time');

      if (error) throw error;
      setTimeSlots(data || []);
    } catch (error) {
      console.error('Error fetching time slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedSlot) {
      alert('Please select a time slot');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('book_appointment', {
          p_slot_id: selectedSlot.id,
          p_patient_id: patientId,
          p_doctor_id: doctor.id,
          p_symptoms: symptoms || null,
          p_notes: notes || null
        });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      const appointmentId = data.id;

      // Create notification for doctor
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: doctor.id,
            type: 'new_appointment',
            title: 'New Appointment Booked',
            message: `You have a new appointment scheduled for ${selectedDate} at ${selectedSlot.start_time}`,
            related_id: appointmentId
          }
        ]);

      alert('Appointment booked successfully!');
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Failed to book appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDatesInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];

    // Add empty cells for days before month starts
    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
      dates.push(null);
    }

    // Add all days in month
    for (let date = 1; date <= lastDay.getDate(); date++) {
      dates.push(new Date(year, month, date));
    }

    return dates;
  };

  const isDateAvailable = (date) => {
    if (!date) return false;
    const dateStr = date.toISOString().split('T')[0];
    return availableDates.includes(dateStr);
  };

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-50">
        <div className="px-4 py-4 flex items-center">
          <button onClick={onBack} className="mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Book Appointment</h1>
        </div>
      </div>

      {/* Doctor Info */}
      <div className="bg-white px-6 py-4 mb-2">
        <div className="flex items-center space-x-3">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center">
            <span className="text-white font-bold text-2xl">
              {doctor.name?.charAt(0)}
            </span>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Dr. {doctor.name}</h2>
            <p className="text-sm text-gray-600">{doctor.specialization}</p>
            <div className="flex items-center mt-1">
              <span className="text-yellow-400 text-xs">⭐</span>
              <span className="text-xs text-gray-600 ml-1">4.5 (2530)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Doctor Biography (optional) */}
      <div className="bg-white px-6 py-4 mb-2">
        <h3 className="font-bold text-gray-900 mb-2">Doctor Biography</h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          {doctor.name} is a dedicated {doctor.specialization.toLowerCase()} with over 15 years of experience
          in caring for children's health. She is passionate about ensuring the well-being of young ones and
          believes in a holistic approach.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">Neurologist</span>
          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">Neuromedicine</span>
          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">Medicine</span>
        </div>
      </div>

      {/* Schedules */}
      <div className="bg-white px-6 py-4 mb-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Schedules</h3>
          <span className="text-sm text-gray-500">
            {fullMonthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
        </div>

        {/* Calendar */}
        <div className="mb-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center text-xs text-gray-500 font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Date Grid */}
          <div className="grid grid-cols-7 gap-2">
            {getDatesInMonth().map((date, index) => {
              const isAvailable = isDateAvailable(date);
              const isSelected = date && selectedDate === date.toISOString().split('T')[0];
              const isToday = date && date.toDateString() === new Date().toDateString();

              return (
                <button
                  key={index}
                  onClick={() => date && isAvailable && setSelectedDate(date.toISOString().split('T')[0])}
                  disabled={!date || !isAvailable}
                  className={`
                    aspect-square rounded-lg flex flex-col items-center justify-center text-sm
                    ${!date ? 'invisible' : ''}
                    ${isSelected ? 'bg-teal-600 text-white font-bold' : ''}
                    ${!isSelected && isAvailable ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : ''}
                    ${!isSelected && !isAvailable && date ? 'text-gray-300 cursor-not-allowed' : ''}
                    ${isToday && !isSelected ? 'ring-2 ring-teal-600' : ''}
                  `}
                >
                  {date && (
                    <>
                      <span>{date.getDate()}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time of Day Selection */}
        {selectedDate && (
          <>
            <h4 className="font-semibold text-gray-900 mb-3 mt-6">Choose Times</h4>
            <div className="flex space-x-2 mb-4">
              {timeOfDay.map(time => (
                <button
                  key={time}
                  onClick={() => setSelectedTimeOfDay(time)}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${selectedTimeOfDay === time
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                    }`}
                >
                  {time}
                </button>
              ))}
            </div>

            {/* Time Slots */}
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-3">{selectedTimeOfDay} Schedule</h5>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
                </div>
              ) : timeSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map(slot => {
                    const isSelected = selectedSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setSelectedTime(slot.start_time);
                        }}
                        className={`py-3 rounded-lg font-medium transition ${isSelected
                            ? 'bg-teal-600 text-white'
                            : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                          }`}
                      >
                        {formatTime(slot.start_time)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No available slots for {selectedTimeOfDay.toLowerCase()}</p>
              )}
            </div>
          </>
        )}

        {/* Additional Info */}
        {selectedSlot && (
          <div className="space-y-3 mt-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Symptoms (Optional)
              </label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Describe your symptoms..."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information..."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      {/* Book Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
        <button
          onClick={handleBookAppointment}
          disabled={!selectedSlot || loading}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition shadow-lg ${selectedSlot && !loading
              ? 'bg-teal-600 text-white hover:bg-teal-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
        >
          {loading ? 'Booking...' : `Book Appointment ($50.99)`}
        </button>
      </div>
    </div>
  );
}