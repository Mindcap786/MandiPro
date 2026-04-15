'use client';

import { useSubscription } from './use-subscription';
import { useCallback } from 'react';

// useMenuAccess — checks plan-based route access
// Returns: isAllowed(route) boolean
// Gracefully returns true if no allowed_menus defined (backward compat)

export function useMenuAccess() {
  const { allowedMenus, isFullyBlocked, isAdminSuspended } = useSubscription();

  const isAllowed = useCallback((route: string): boolean => {
    // Hard blocks — nothing allowed
    if (isAdminSuspended) return false;

    // No menu restrictions configured → allow everything
    if (!allowedMenus || allowedMenus.length === 0) return true;

    // Check if route starts with any allowed menu prefix
    const normalizedRoute = route.replace(/^\//, '').split('/')[0];
    return allowedMenus.some((menu) => {
      const normalizedMenu = menu.replace(/^\//, '');
      return normalizedRoute === normalizedMenu ||
             normalizedRoute.startsWith(normalizedMenu + '/');
    });
  }, [allowedMenus, isFullyBlocked, isAdminSuspended]);

  return { isAllowed, allowedMenus };
}
