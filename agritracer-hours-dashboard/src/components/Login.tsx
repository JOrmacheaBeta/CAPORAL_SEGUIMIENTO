import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-4 rotate-3">
            <ShieldCheck className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
            Agritracer <span className="text-primary">Analytics</span>
          </h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">
            Sistema de Reporte de Horas
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardHeader className="space-y-1 pb-6 border-b border-slate-800/50">
            <CardTitle className="text-xl font-black text-white uppercase tracking-tight">Iniciar Sesión</CardTitle>
            <CardDescription className="text-slate-400 font-medium">
              Ingresa tus credenciales para acceder al dashboard
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 pt-6">
              {error && (
                <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-500">
                  <AlertDescription className="font-bold text-xs uppercase tracking-tight">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 font-bold text-[10px] uppercase tracking-widest">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-600 focus:border-primary/50 transition-all h-11"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300 font-bold text-[10px] uppercase tracking-widest">Contraseña</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-950/50 border-slate-800 text-white focus:border-primary/50 transition-all h-11"
                />
              </div>
            </CardContent>
            <CardFooter className="pb-8">
              <Button 
                type="submit" 
                className="w-full h-12 font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20" 
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Acceder al Sistema
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <p className="text-center mt-8 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Agritracer Analytics. Acceso Restringido.
        </p>
      </motion.div>
    </div>
  );
}
