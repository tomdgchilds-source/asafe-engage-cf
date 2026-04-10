import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Admin() {
  const [, setLocation] = useLocation();

  // Redirect to admin login
  useEffect(() => {
    setLocation("/admin/login");
  }, [setLocation]);

  return null;
}