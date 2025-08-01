import * as React from "react"
import Link from "next/link"
import { Container } from "@/components/ui/container"

export function Footer() {
  return (
    <footer className="mt-auto border-t">
      <Container>
        <div className="py-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* About */}
            <div>
              <h3 className="text-lg font-semibold">Field Reservations</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Book sports fields quickly and easily for your league games and practices.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold">Quick Links</h4>
              <ul className="mt-2 space-y-2">
                <li>
                  <Link
                    href="/calendar"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    View Calendar
                  </Link>
                </li>
                <li>
                  <Link
                    href="/fields"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Available Fields
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-sm font-semibold">Support</h4>
              <ul className="mt-2 space-y-2">
                <li>
                  <Link
                    href="/help"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold">Contact</h4>
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>Email: support@fieldreservations.com</p>
                <p>Phone: (555) 123-4567</p>
                <p>Hours: Mon-Fri 9AM-5PM</p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t pt-8">
            <p className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Field Reservations. All rights reserved.
            </p>
          </div>
        </div>
      </Container>
    </footer>
  )
}