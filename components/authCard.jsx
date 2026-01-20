'use client';
import { useState } from "react";

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import supabase from "lib/supabaseClient";


export default function AuthCard() {
  const [mode, setMode] = useState("login");
  return (
    <div className="w-full max-w-sm mx-auto">
      {mode === "login" ? (
        <LoginCard onSwitch={() => setMode("signup")} />
      ) : (
        <SignupCard onSwitch={() => setMode("login")} />
      )}
    </div>
  );
}
function LoginCard({ onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async function(event) {
    const {data, error} = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) {
      return;
    }
    if (data) {
      console.log("User successfully logged in.");
    }
    setEmail('');
    setPassword('');
  }
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Login</CardTitle>
        <CardDescription>Enter your credentials to sign in.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} required/>
        </div>

        <div className="space-y-1">
          <Label>Password</Label>
          <Input id="password" type="password" placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} required/>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col space-y-3">
        <Button className="w-full" onClick={handleSignIn} >Sign In</Button>
        <Button
          variant="ghost"
          onClick={onSwitch}
          className="w-full text-sm text-muted-foreground"
        >
          Don't have an account? Sign up
        </Button>
      </CardFooter>
    </Card>
  );
}

function SignupCard({ onSwitch }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const handleSignup = async function(event) {
    const {data, error} = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    if (error) {
      return;
    }
    if (data) {
      console.log("User successfully created.");
    }
    setEmail('');
    setPassword('');
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Sign up for a new account.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
        </div>

        <div className="space-y-1">
          <Label>Password</Label>
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required/>
        </div>

        <div className="space-y-1">
          <Label>Confirm Password</Label>
          <Input id="passwordConfirm" type="password" placeholder="••••••••" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required/>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col space-y-3">
        <Button className="w-full" onClick={handleSignup}>Create Account</Button>

        <Button
          variant="ghost"
          onClick={onSwitch}
          className="w-full text-sm text-muted-foreground"
        >
          Already have an account? Log in
        </Button>
      </CardFooter>
    </Card>
  );
}
