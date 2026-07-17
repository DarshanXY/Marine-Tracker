import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Compass } from 'lucide-react';
import { Button } from '@/components';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-lg card-accent relative max-w-lg p-10"
      >
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ocean-50 text-ocean-500">
          <Compass size={32} />
        </span>
        <h1 className="font-display text-6xl font-black text-gradient">404</h1>
        <p className="mt-3 font-display text-lg font-semibold text-slate-800">Lost at sea</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          This page drifted off the map. Let's get you back to shore.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/"><Button variant="primary" icon={<Home size={16} />}>Home</Button></Link>
          <Link to="/app"><Button variant="outline">Dashboard</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}
