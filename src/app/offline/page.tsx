import { WifiOff } from "lucide-react"
import { Container } from "@/components/ui/container"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center space-y-4 pt-6 text-center">
          <WifiOff className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">You're Offline</h1>
          <p className="text-muted-foreground">
            It looks like you've lost your internet connection. Some features may be unavailable until you're back online.
          </p>
          <p className="text-sm text-muted-foreground">
            Don't worry - any reservations you've made will be synced once you reconnect.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    </Container>
  )
}