import * as React from "react"
import { cn } from "@/utils/cn"

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType
}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, as: Comp = "div", ...props }, ref) => {
    return (
      <Comp
        ref={ref}
        className={cn("container", className)}
        {...props}
      />
    )
  }
)
Container.displayName = "Container"

export { Container }