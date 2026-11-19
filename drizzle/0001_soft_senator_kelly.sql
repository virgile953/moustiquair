ALTER TABLE `sightings` ADD `city_insee` text DEFAULT '95306' NOT NULL;--> statement-breakpoint
CREATE INDEX `sightings_city_idx` ON `sightings` (`city_insee`);