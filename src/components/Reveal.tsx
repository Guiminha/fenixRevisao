import React from "react";
import { motion, useReducedMotion, Variants } from "motion/react";

type Direction = "up" | "down" | "left" | "right" | "none";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: Direction;
  distance?: number;
  once?: boolean;
  stagger?: boolean;
}

// Shared easing curve (spring-like, smooth entrance)
const EASE = [0.16, 1, 0.3, 1] as const;

// Base variants builder used across the app
export function buildVariants(
  direction: Direction = "up",
  distance: number = 24
): Variants {
  const offset = (axis: "x" | "y", invert = 1) => {
    if (direction === "none") return 0;
    if (axis === "x") return direction === "left" ? distance * invert : direction === "right" ? -distance * invert : 0;
    return direction === "up" ? distance * invert : direction === "down" ? -distance * invert : 0;
  };

  return {
    hidden: { opacity: 0, x: offset("x"), y: offset("y") },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.7, ease: EASE }
    },
  };
}

/**
 * Reveal — wraps any content with a smooth entrance animation
 * triggered when it scrolls into view (with reduced-motion support).
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.7,
  direction = "up",
  distance = 24,
  once = true,
}: RevealProps) {
  const prefersReduced = useReducedMotion();
  const variants = buildVariants(direction, distance);

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.12, margin: "0px 0px -40px 0px" }}
      variants={{
        hidden: { ...variants.hidden },
        visible: {
          ...variants.visible,
          transition: { duration, ease: EASE, delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * StaggerContainer + StaggerItem — animate a list of children one after another.
 *
 * Usage:
 *  <StaggerContainer>
 *    <StaggerItem>…</StaggerItem>
 *    <StaggerItem>…</StaggerItem>
 *  </StaggerContainer>
 */
export function StaggerContainer({
  children,
  className,
  stagger = 0.08,
  once = true,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  once?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "0px 0px -40px 0px" }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
  distance?: number;
  key?: React.Key;
}

const StaggerItem = ({
  children,
  className,
  direction = "up",
  distance = 20,
}: StaggerItemProps) => {
  const variants = buildVariants(direction as Direction, distance);
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
};

export { StaggerItem };

export { motion };