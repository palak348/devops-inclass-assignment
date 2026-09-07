# ---------- Stage 1: compile ----------
FROM eclipse-temurin:17-jdk-alpine AS build

WORKDIR /app
COPY Main.java ./
RUN javac Main.java

# ---------- Stage 2: run ----------
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app
COPY --from=build /app/Main.class ./

EXPOSE 8000

CMD ["java", "Main"]
