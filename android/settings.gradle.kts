pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

rootProject.name = "android"

// TODO: Include Ensu in shared linting.
includeBuild("apps/ensu")
