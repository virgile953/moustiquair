CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`projected_x` real NOT NULL,
	`projected_y` real NOT NULL,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`mosquito_count` text NOT NULL,
	`reporter_confidence` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `sightings_status_idx` ON `sightings` (`status`);--> statement-breakpoint
CREATE INDEX `sightings_observed_at_idx` ON `sightings` (`observed_at`);--> statement-breakpoint
CREATE INDEX `sightings_demo_idx` ON `sightings` (`is_demo`);--> statement-breakpoint
CREATE INDEX `sightings_projected_idx` ON `sightings` (`projected_x`,`projected_y`);