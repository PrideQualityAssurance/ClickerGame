
import React from 'react';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className='', ...props }) => (
  <div className={`rounded-2xl border ${className}`} {...props} />
);
export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className='', ...props }) => (
  <div className={`p-4 pb-0 ${className}`} {...props} />
);
export const CardTitle: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className='', ...props }) => (
  <div className={`font-semibold ${className}`} {...props} />
);
export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className='', ...props }) => (
  <div className={`p-4 ${className}`} {...props} />
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'secondary'|'destructive', size?: 'sm'|'icon'| 'default' };
export const Button: React.FC<ButtonProps> = ({ className='', variant='default', size='default', ...props }) => {
  const variants: Record<string,string> = {
    default: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    destructive: 'bg-rose-600 hover:bg-rose-700 text-white',
  };
  const sizes: Record<string,string> = {
    default: 'px-4 py-2 rounded-xl',
    sm: 'px-3 py-1.5 text-sm rounded-xl',
    icon: 'p-2 rounded-xl',
  };
  return <button className={`${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
};

export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className='', ...props }) => (
  <span className={`inline-block bg-slate-700 text-white px-2 py-0.5 rounded-lg ${className}`} {...props} />
);

export const Progress: React.FC<{value:number, className?:string}> = ({ value, className='' }) => (
  <div className={`w-full bg-slate-700/60 rounded-full overflow-hidden ${className}`}>
    <div className="h-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const ScrollArea: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className='', ...props }) => (
  <div className={`overflow-y-auto ${className}`} {...props} />
);
