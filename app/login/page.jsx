'use client';
import { useState } from "react";
import AuthCard from "../components/authCard";


export default function Page() {
  return (
    <div>
      <h1 className="text-center">Login to get started</h1>
      <AuthCard />
    </div>
      );
}
