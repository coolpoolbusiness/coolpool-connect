import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo.png";

export function SiteFooter() {
  return (
    <footer className="mt-16 sm:mt-20 md:mt-24 border-t border-border/60">
      <div className="container mx-auto px-4 sm:px-5 py-10 sm:py-12 max-w-7xl">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center">
              <img src={logo} alt="Coolpool Logo" className="h-16 w-auto object-contain" />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-sm">
              Smart intercity ride-sharing — fair prices, friendly hosts, every kilometer counted.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/" className="hover:text-foreground transition-base">
                  Find a ride
                </Link>
              </li>
              <li>
                <Link to="/host" className="hover:text-foreground transition-base">
                  Host a ride
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/about" className="hover:text-foreground transition-base">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-foreground transition-base">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/terms" className="hover:text-foreground transition-base">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-foreground transition-base">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:text-foreground transition-base">
                  Refund Policy
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-foreground transition-base">
                  Pricing & Payments
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/60 flex flex-col md:flex-row items-center justify-center md:justify-between gap-3 md:gap-4 text-xs text-muted-foreground text-center md:text-start">
          <p>
            © {new Date().getFullYear()} Coolpool. All rights reserved by KK Exports, Illuminate
            Infinity INDIA.
          </p>
          <p className="max-w-xs md:max-w-none">
            Built for travelers and hosts who care about the journey.
          </p>
        </div>
      </div>
    </footer>
  );
}
