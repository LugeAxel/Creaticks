import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingPage.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginPage.vue'),
      meta: { requiresGuest: true }
    },
    {
      path: '/daftar',
      name: 'signup',
      component: () => import('@/views/SignUpPage.vue'),
      meta: { requiresGuest: true }
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('@/views/VerifyEmail.vue')
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/verifikasi-email',
      name: 'email-verification',
      component: () => import('@/views/EmailVerification.vue')
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPassword.vue')
    },
    {
      path: '/pilih-peran',
      name: 'role-picker',
      component: () => import('@/views/RolePicker.vue')
    },
    {
      path: '/undangan',
      name: 'invitations',
      component: () => import('@/views/InvitationsPage.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/undangan/:id',
      name: 'invitation-response',
      component: () => import('@/views/InvitationResponse.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/pengaturan',
      name: 'profile-settings',
      component: () => import('@/views/ProfileSettings.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/creator',
      name: 'creator-dashboard',
      component: () => import('@/views/CreatorDashboard.vue'),
      meta: { requiresAuth: true, requiresCreator: true }
    },
    {
      path: '/creator/team',
      name: 'team-management',
      component: () => import('@/views/TeamManagement.vue'),
      meta: { requiresAuth: true, requiresCreator: true }
    },
    {
      path: '/acara',
      name: 'acara-browse',
      component: () => import('@/views/AcaraBrowse.vue')
    },
    {
      path: '/creator/events/new',
      name: 'event-editor',
      component: () => import('@/views/EventEditor.vue'),
      meta: { requiresAuth: true, requiresCreator: true }
    },
    {
      path: '/creator/events/:id/edit',
      name: 'event-editor-edit',
      component: () => import('@/views/EventEditor.vue'),
      meta: { requiresAuth: true, requiresCreator: true }
    },
    {
      path: '/creator/events',
      name: 'creator-events',
      component: () => import('@/views/CreatorEvents.vue'),
      meta: { requiresAuth: true, requiresCreator: true }
    },
    {
      path: '/tickets',
      name: 'tickets-list',
      component: () => import('@/views/TicketsList.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/tickets/:id',
      name: 'digital-ticket',
      component: () => import('@/views/DigitalTicket.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/chat',
      name: 'buyer-chat',
      component: () => import('@/views/BuyerChat.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/events/saya',
      name: 'my-events',
      component: () => import('@/views/MyEvents.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/events/:id',
      name: 'event-detail',
      component: () => import('@/views/EventDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/events/:eventId/manage',
      component: () => import('@/components/layout/EventManageLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'event-manage-overview' } },
        { path: 'overview', name: 'event-manage-overview', component: () => import('@/views/EventManageOverview.vue') },
        { path: 'queue', name: 'event-manage-queue', component: () => import('@/views/EventManageQueue.vue') },
        { path: 'chat', name: 'event-manage-chat', component: () => import('@/views/EventManageChat.vue') },
        { path: 'scan', name: 'event-manage-scan', component: () => import('@/views/EventManageScan.vue') },
        { path: 'attendance', name: 'event-manage-attendance', component: () => import('@/views/EventManageAttendance.vue') },
        { path: 'design', name: 'event-manage-design', component: () => import('@/views/EventManageDesign.vue') },
        { path: 'settings', name: 'event-manage-settings', component: () => import('@/components/shared/PlaceholderTab.vue'), props: { title: 'Pengaturan Acara', icon: 'settings' } },
        { path: 'admins', name: 'event-manage-admins', component: () => import('@/components/shared/PlaceholderTab.vue'), props: { title: 'Manajemen Admin', icon: 'admin_panel_settings' } },
        { path: 'analytics', name: 'event-manage-analytics', component: () => import('@/components/shared/PlaceholderTab.vue'), props: { title: 'Analitik', icon: 'analytics' } }
      ]
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: () => import('@/views/AdminDashboard.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/events/:eventId/queue',
      name: 'request-queue',
      component: () => import('@/views/RequestQueue.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/events/:eventId/chat',
      name: 'admin-chat',
      component: () => import('@/views/AdminChat.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/events/:eventId/scanner',
      name: 'qr-scanner',
      component: () => import('@/views/QRScanner.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/events/:eventId/attendance',
      name: 'attendance-panel',
      component: () => import('@/views/AttendancePanel.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const { data: { session } } = await supabase.auth.getSession()
  const isAuthenticated = !!session
  const role = session?.user?.user_metadata?.role

  if (to.meta.requiresAuth && !isAuthenticated) {
    sessionStorage.setItem('redirectAfterLogin', to.fullPath)
    return next({ name: 'login' })
  }

  if (to.meta.requiresAuth && isAuthenticated) {
    const emailVerified = session.user?.email_confirmed_at != null

    if (!emailVerified) {
      if (to.name !== 'email-verification') {
        return next({
          name: 'email-verification',
          query: { email: session.user.email }
        })
      }
      return next()
    }
  }

  if (isAuthenticated) {
    const needsRole = !role

    if (needsRole && to.name !== 'role-picker') {
      return next({ name: 'role-picker' })
    }

    if (to.name === 'role-picker' && !needsRole) {
      return next({ name: role === 'creator' ? 'creator-dashboard' : 'dashboard' })
    }

    if (to.meta.requiresCreator && role !== 'creator') {
      return next({ name: 'landing' })
    }

    if (to.name === 'landing') {
      return next({ name: role === 'creator' ? 'creator-dashboard' : 'dashboard' })
    }
  }

  if (to.meta.requiresGuest && isAuthenticated) {
    const emailVerified = session.user?.email_confirmed_at != null
    if (!emailVerified) {
      return next({
        name: 'email-verification',
        query: { email: session.user.email }
      })
    }
    return next({ name: role === 'creator' ? 'creator-dashboard' : 'dashboard' })
  }

  next()
})

export default router
