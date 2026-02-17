/**
 * Optional: Browser Notification Permission Handler
 * 
 * Add this to Admin.jsx useEffect to enable browser notifications
 * This will show OS-level notifications for new doctor registrations
 */

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('This browser does not support desktop notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

/**
 * Send Browser Notification for Doctor Registration
 */
export const sendBrowserNotification = (title, options = {}) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/doctor-icon.png',
      badge: '/doctor-badge.png',
      tag: 'doctor-approval',
      requireInteraction: false,
      ...options
    });
  }
};

/**
 * Usage in Admin.jsx:
 * 
 * useEffect(() => {
 *   if (isAuthenticated) {
 *     requestNotificationPermission();
 *   }
 * }, [isAuthenticated]);
 * 
 * And in Notifications.jsx:
 * 
 * if ('Notification' in window && Notification.permission === 'granted') {
 *   new Notification('New Doctor Registration', {
 *     body: `${payload.new.doctor_name} is pending approval`,
 *     icon: '/doctor-icon.png'
 *   });
 * }
 */
