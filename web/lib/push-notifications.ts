import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabaseClient';

export async function initializePush(
  userId: string | undefined, 
  orgId: string | undefined,
  router: any
) {
  // Only run on native, not web
  if (!Capacitor.isNativePlatform()) return;
  if (!userId || !orgId) return;
  
  try {
    console.log("Configuring Capacitor Push Notifications");
    
    // Request permission
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
        console.warn("Push permissions denied by user.");
        return;
    }
    
    // Register with APNs/FCM
    await PushNotifications.register();
    
    // Save token to Supabase push_notification_tokens table
    PushNotifications.addListener('registration', async (token) => {
        console.log("Push registration token:", token.value);
        
        await supabase.from('push_notification_tokens').upsert({
            user_id: userId,
            organization_id: orgId,
            token: token.value,
            platform: Capacitor.getPlatform(),
            last_seen: new Date().toISOString(),
        }, { onConflict: 'token' });
    });

    PushNotifications.addListener('registrationError', (error: any) => {
        console.error('Error on push registration: ', JSON.stringify(error));
    });
    
    // Handle notification received while app is OPEN
    PushNotifications.addListener('pushNotificationReceived', 
        (notification) => {
            console.log('Push received in foreground:', notification);
            // This is visually handled by useStockAlerts Realtime anyway,
            // but if we were strictly relying on push:
            // showSnackbar(...)
        }
    );
    
    // Handle notification TAP (app was in background/closed)
    PushNotifications.addListener('pushNotificationActionPerformed',
        (action) => {
            console.log('Push action performed:', action);
            const route = action.notification.data?.route;
            if (route && router) {
                router.push(route);
            }
        }
    );

  } catch (err: any) {
    console.error("Failed to initialize push notifications", err);
  }
}
