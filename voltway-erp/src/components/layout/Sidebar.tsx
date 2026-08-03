'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

const navItems = [
    { name: 'Dashboard', href: '/', icon: 'space_dashboard' },
    { name: 'Procurement', href: '/procurement', icon: 'shopping_cart' },
    { name: 'Inventory', href: '/inventory', icon: 'inventory_2', badge: 3 },
    { name: 'Materials', href: '/materials', icon: 'category' },
    { name: 'Sales', href: '/sales', icon: 'point_of_sale' },
    { name: 'Suppliers', href: '/suppliers', icon: 'local_shipping' },
];

const intelligenceItems = [
    { name: 'Hugo AI', href: '/hugo', icon: 'smart_toy', special: true },
    { name: 'Dispatch', href: '/dispatch', icon: 'tune' },
    { name: 'Events', href: '/events', icon: 'notifications' },
    { name: 'Imports', href: '/imports', icon: 'upload_file' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    const initials = (user?.displayName || user?.email || 'U')
        .split(/[\s@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || 'U';

    return (
        <aside className="w-[260px] h-screen bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col flex-shrink-0 z-20">
            <div className="p-5 flex items-center gap-3">
                <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                        <span className="material-symbols-outlined text-white text-xl">electric_scooter</span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900"></div>
                </div>
                <div className="flex flex-col">
                    <h1 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Voltway ERP</h1>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Operations Hub</p>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Main Menu
                </p>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                                ${isActive
                                    ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:text-cyan-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
                            )}
                            <span
                                className={`material-symbols-outlined text-xl transition-colors
                                    ${isActive ? 'text-cyan-500' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
                                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                            >
                                {item.icon}
                            </span>
                            <span className="text-[13px] font-medium">{item.name}</span>
                            {item.badge && (
                                <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-md">
                                    {item.badge}
                                </span>
                            )}
                        </Link>
                    );
                })}

                <div className="mt-6 mb-2">
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Intelligence
                    </p>
                </div>
                {intelligenceItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                                ${isActive
                                    ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:text-cyan-400'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            <span
                                className={`material-symbols-outlined text-xl transition-colors
                                    ${item.special ? 'text-indigo-500' : isActive ? 'text-cyan-500' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-[13px] font-medium">{item.name}</span>
                            {item.special && (
                                <span className="ml-auto px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full">
                                    AI
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                {user?.role === 'admin' && (
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-white transition-all group"
                    >
                        <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
                        <span className="text-[13px] font-medium">Admin</span>
                    </Link>
                )}
                <Link
                    href="/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-white transition-all group"
                >
                    <span className="material-symbols-outlined text-lg">settings</span>
                    <span className="text-[13px] font-medium">Settings</span>
                </Link>
                <div className="flex items-center gap-3 px-3 py-3 mt-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-[11px] font-bold text-white shadow-md">
                        {initials}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                            {user?.displayName || user?.email || 'User'}
                        </p>
                        <p className="text-[11px] text-slate-500 capitalize">{user?.role || 'viewer'}</p>
                    </div>
                    <button
                        type="button"
                        title="Sign out"
                        onClick={() => void signOut()}
                        className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
