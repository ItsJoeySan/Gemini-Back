import "dotenv/config";

import express from "express";
import session from "express-session";
import cors from "cors";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { PrismaClient } from "@prisma/client";

const app = express();

const CLIENT_URL = "http://localhost:5173/";
const prisma = new PrismaClient();

app.use(
  cors({
    origin: "http://localhost:5173",
    Credential: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.AUTH_SECRET,
    resave: false,
    saveUninitialized: true,
    //cookie is use to store the session time, to decide when the session will expire
    //if cookie will not mention then session expire when we close the browser
    cookie: {
      //1sec * 60s * 60m * 1day
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(passport.authenticate("session"));
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("profile data: " + JSON.stringify(profile, null, 2));

      try {
        let user = await prisma.user.findFirst({
          where: { googleId: profile.id },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              image: profile.photos[0].value,
            },
          });
        }
        console.log("USer:" + JSON.stringify(user, null, 2));
        return done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  console.log(JSON.stringify("serial: ", user));
  done(null, user);
});

passport.deserializeUser(async (user, done) => {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    console.log("user from deserializeUser: ", existingUser);
    if (user) {
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error, null);
  }
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
  (req, res) => {
    res.redirect("http://localhost:5173");
  }
);

//without it google can't redirect us back to our website
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: CLIENT_URL,
    //if authentication failed we will redirect them to login route
    failureRedirect: "http://localhost:5173/login", //add a login route here
    failureFlash: true,
  })
);

app.get("/login/success", async (req, res) => {
  if (req.user) {
    res.status(200).json({
      success: true,
      message: "Successfull",
      user: req.user,
    });
  }
});

app.get("/login/failed", async (req, res) => {
  res.status(401).json({
    success: false,
    message: "failure",
  });
});

//this is where we will redirect when we click on "continue with google"
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect(CLIENT_URL);
});

//this is where we will redirect when we click on "continue with google"
// app.use("/auth", authRouter);

//without it google can't redirect us back to our website
const isAuthenticated = async (req, res, next) => {
  console.log("from145", req.user);
  if (req.user) {
    return next();
  }
  res.status(401).json({ message: "User is not authenticated" });
};

app.post("/user/post", isAuthenticated, async (req, res) => {
  console.log("body: ", await req.body);
  res.send("okay");
});

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
