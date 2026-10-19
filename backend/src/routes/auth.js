import { Router } from "express";
import bcrypt from "bcryptjs";

import {
  supabase,
} from "../config/supabase.js";

import {
  clean,
  normalize,
  mapUser,
  publicUser,
  createAccessToken,
} from "../utils.js";
import {
  isValidEmailAddress,
} from "../authValidation.js";
import {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  isValidEmailVerificationToken,
} from "../emailVerification.js";
import {
  sendVerificationEmail,
} from "../email.js";

const router = Router();

const allowedRoles = new Set([
  "buyer",
  "business_seller",
  "individual_seller",
]);

function prepareInterests(
  interests,
  role
) {
  if (role !== "buyer") {
    return [];
  }

  if (!Array.isArray(interests)) {
    return [];
  }

  return [
    ...new Set(
      interests
        .map((interest) =>
          clean(interest)
        )
        .filter(Boolean)
    ),
  ];
}

router.post(
  "/register",
  async (request, response) => {
    try {
      const name = clean(
        request.body.name
      );

      const email = normalize(
        request.body.email
      );

      const password = String(
        request.body.password || ""
      );

      const role = clean(
        request.body.role
      ).toLowerCase();

      const interests =
        prepareInterests(
          request.body.interests,
          role
        );
      const verification =
        createEmailVerificationToken();

      if (!name) {
        return response
          .status(400)
          .json({
            message:
              "Full name is required",
          });
      }

      if (
        name.length < 2 ||
        name.length > 80
      ) {
        return response
          .status(400)
          .json({
            message:
              "Full name must be between 2 and 80 characters",
          });
      }

      if (!isValidEmailAddress(email)) {
        return response
          .status(400)
          .json({
            message:
              "Please enter a valid email address",
          });
      }

      if (password.length < 6) {
        return response
          .status(400)
          .json({
            message:
              "Password must be at least 6 characters long",
          });
      }

      if (!allowedRoles.has(role)) {
        return response
          .status(400)
          .json({
            message:
              "Role must be buyer, business seller or individual seller",
          });
      }

      if (
        role === "buyer" &&
        interests.length === 0
      ) {
        return response
          .status(400)
          .json({
            message:
              "Buyer must select at least one interest",
          });
      }

      const {
        data: existingUser,
        error: existingUserError,
      } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingUserError) {
        console.error(
          "Check existing user error:",
          existingUserError
        );

        return response
          .status(500)
          .json({
            message:
              "Account availability could not be checked",
          });
      }

      if (existingUser) {
        return response
          .status(409)
          .json({
            message:
              "Email is already registered",
          });
      }

      const {
        data: existingPending,
        error: existingPendingError,
      } = await supabase
        .from("pending_user_registrations")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingPendingError) {
        console.error(
          "Check pending registration error:",
          existingPendingError
        );

        return response
          .status(500)
          .json({
            message:
              "Registration could not be started. Check the email verification database migration.",
          });
      }

      if (existingPending) {
        return response
          .status(409)
          .json({
            message:
              "A signup is already pending for this email. Check your inbox or request another verification link.",
          });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );
      const sentAt =
        new Date().toISOString();

      const {
        error: pendingError,
      } = await supabase
        .from("pending_user_registrations")
        .insert({
          name,
          email,
          password_hash:
            passwordHash,
          role,
          interests,
          email_verification_token_hash:
            verification.tokenHash,
          email_verification_expires_at:
            verification.expiresAt,
          email_verification_sent_at: sentAt,
        })
        .select("id")
        .single();

      if (pendingError) {
        console.error(
          "Save pending registration error:",
          pendingError
        );

        if (
          pendingError.code ===
          "23505"
        ) {
          return response
            .status(409)
            .json({
              message:
                "Email is already registered",
            });
        }

        return response
          .status(500)
          .json({
            message:
              "Registration could not be started. Check the email verification database migration.",
          });
      }

      let delivery = null;

      try {
        delivery = await sendVerificationEmail({
          email,
          name,
          token: verification.token,
        });
      } catch (deliveryError) {
        console.error(
          "Registration verification email failed:",
          deliveryError.message
        );

        const { error: resetCooldownError } =
          await supabase
            .from("pending_user_registrations")
            .update({
              email_verification_sent_at:
                new Date(Date.now() - 60_001).toISOString(),
            })
            .eq("email", email)
            .eq(
              "email_verification_token_hash",
              verification.tokenHash
            );

        if (resetCooldownError) {
          console.error(
            "Reset failed registration email cooldown:",
            resetCooldownError
          );
        }
      }

      return response
        .status(201)
        .json({
          message: delivery?.delivered
            ? "We sent a verification link to your email. Click it to finish creating your account."
            : delivery?.previewUrl
              ? "Your signup is pending. Open the local preview link to continue and finish creating your account."
              : "Your signup is saved but the verification email could not be sent. Use the resend option to try again.",
          verificationEmailSent:
            delivery?.delivered || false,
          email,
          ...(delivery?.delivered || delivery?.previewUrl
            ? {
                resendAvailableAt: new Date(
                  Date.parse(sentAt) + 60_000
                ).toISOString(),
              }
            : {}),
          ...(delivery?.previewUrl
            ? {
                verificationPreviewUrl:
                  delivery.previewUrl,
              }
            : {}),
        });
    } catch (error) {
      console.error(
        "Registration error:",
        error
      );

      return response
        .status(500)
        .json({
          message:
            "Account could not be created",
        });
    }
  }
);

router.post(
  "/verify-email",
  async (request, response) => {
    try {
      const token = request.body?.token;

      if (!isValidEmailVerificationToken(token)) {
        return response
          .status(400)
          .json({
            message:
              "Verification link is invalid or expired. Request a new email and try again.",
          });
      }

      const now = new Date().toISOString();
      const tokenHash =
        hashEmailVerificationToken(token);
      const {
        data: createdUserId,
        error: createError,
      } = await supabase.rpc(
        "complete_pending_user_registration",
        {
          p_token_hash: tokenHash,
        }
      );

      if (createError) {
        console.error(
          "Complete pending registration error:",
          createError
        );

        return response
          .status(500)
          .json({
            message:
              "Account creation could not be completed. Check the email verification database migration and try again.",
          });
      }

      if (createdUserId) {
        return response.json({
          message:
            "Your email is verified and your account has been created. You can now log in.",
          accountCreated: true,
        });
      }

      // Preserve links issued before pending registrations were introduced.
      const {
        data: verifiedUser,
        error,
      } = await supabase
        .from("users")
        .update({
          email_verified: true,
          email_verification_required: true,
          email_verification_token_hash: null,
          email_verification_expires_at: null,
        })
        .eq(
          "email_verification_token_hash",
          tokenHash
        )
        .gt(
          "email_verification_expires_at",
          now
        )
        .eq("email_verified", false)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error(
          "Email verification update error:",
          error
        );

        return response
          .status(500)
          .json({
            message:
              "Email verification could not be completed. Try again.",
          });
      }

      if (!verifiedUser) {
        return response
          .status(400)
          .json({
            message:
              "Verification link is invalid or expired. Request a new email and try again.",
          });
      }

      return response.json({
        message:
          "Email verified successfully. You can now log in.",
        accountCreated: false,
      });
    } catch (error) {
      console.error(
        "Email verification error:",
        error.message
      );

      return response
        .status(500)
        .json({
          message:
            "Email verification could not be completed. Try again.",
        });
    }
  }
);

router.post(
  "/resend-verification",
  async (request, response) => {
    try {
      const email = normalize(
        request.body?.email
      );

      if (!isValidEmailAddress(email)) {
        return response
          .status(400)
          .json({
            message:
              "Please enter a valid email address",
          });
      }

      const {
        data: user,
        error: userError,
      } = await supabase
        .from("users")
        .select(`
          id,
          name,
          email,
          email_verified,
          email_verification_sent_at,
          is_active
        `)
        .eq("email", email)
        .maybeSingle();

      if (userError) {
        console.error(
          "Find account for verification resend failed:",
          userError
        );

        return response
          .status(500)
          .json({
            message:
              "Verification email could not be requested. Try again.",
          });
      }

      if (!user) {
        const {
          data: pending,
          error: pendingError,
        } = await supabase
          .from("pending_user_registrations")
          .select(`
            id,
            name,
            email,
            email_verification_sent_at
          `)
          .eq("email", email)
          .maybeSingle();

        if (pendingError) {
          console.error(
            "Find pending registration for resend failed:",
            pendingError
          );

          return response
            .status(500)
            .json({
              message:
                "Verification email could not be requested. Try again.",
            });
        }

        if (!pending) {
          return response
            .status(202)
            .json({
              message:
                "If a signup is pending for that email, a verification email will be sent.",
            });
        }

        const pendingLastSentAt =
          pending.email_verification_sent_at
            ? Date.parse(
                pending.email_verification_sent_at
              )
            : 0;

        if (
          Date.now() - pendingLastSentAt <
          60_000
        ) {
          return response
            .status(202)
            .json({
              message:
                "If a signup is pending for that email, a verification email will be sent.",
              resendAvailableAt: new Date(
                pendingLastSentAt + 60_000
              ).toISOString(),
            });
        }

        const verification =
          createEmailVerificationToken();
        const sentAt =
          new Date().toISOString();
        let pendingUpdate = supabase
          .from("pending_user_registrations")
          .update({
            email_verification_token_hash:
              verification.tokenHash,
            email_verification_expires_at:
              verification.expiresAt,
            email_verification_sent_at:
              sentAt,
          })
          .eq("id", pending.id);

        pendingUpdate = pending.email_verification_sent_at
          ? pendingUpdate.lt(
              "email_verification_sent_at",
              new Date(Date.now() - 60_000).toISOString()
            )
          : pendingUpdate.is(
              "email_verification_sent_at",
              null
            );

        const {
          data: updatedPending,
          error: pendingUpdateError,
        } = await pendingUpdate
          .select("id")
          .maybeSingle();

        if (pendingUpdateError) {
          console.error(
            "Prepare pending verification resend failed:",
            pendingUpdateError
          );

          return response
            .status(500)
            .json({
              message:
                "Verification email could not be requested. Try again.",
            });
        }

        if (!updatedPending) {
          return response
            .status(202)
            .json({
              message:
                "If a signup is pending for that email, a verification email will be sent.",
              resendAvailableAt: new Date(
                pendingLastSentAt + 60_000
              ).toISOString(),
            });
        }

        let delivery;

        try {
          delivery = await sendVerificationEmail({
            email: pending.email,
            name: pending.name,
            token: verification.token,
          });
        } catch (deliveryError) {
          console.error(
            "Pending verification resend failed:",
            deliveryError.message
          );

          const { error: resetCooldownError } =
            await supabase
              .from("pending_user_registrations")
              .update({
                email_verification_sent_at:
                  new Date(Date.now() - 60_001).toISOString(),
              })
              .eq("id", pending.id)
              .eq(
                "email_verification_token_hash",
                verification.tokenHash
              );

          if (resetCooldownError) {
            console.error(
              "Reset failed pending verification resend cooldown:",
              resetCooldownError
            );
          }

          return response
            .status(503)
            .json({
              message:
                "Verification email could not be sent right now. Check the backend email settings and try again later.",
            });
        }

        return response
          .status(202)
          .json({
            message: delivery.previewUrl
              ? "Local test verification link created."
              : "If a signup is pending for that email, a verification email will be sent.",
            ...(delivery.previewUrl
              ? {
                  verificationPreviewUrl:
                    delivery.previewUrl,
                }
              : {}),
            resendAvailableAt: new Date(
              Date.parse(sentAt) + 60_000
            ).toISOString(),
          });
      }

      if (
        user.is_active === false ||
        user.email_verified
      ) {
        return response
          .status(202)
          .json({
            message:
              "If an unverified account exists for that email, a verification email will be sent.",
          });
      }

      const lastSentAt =
        user.email_verification_sent_at
          ? Date.parse(
              user.email_verification_sent_at
            )
          : 0;
      const cooldownRemaining =
        60_000 - (Date.now() - lastSentAt);

      if (cooldownRemaining > 0) {
        return response
          .status(202)
          .json({
            message:
              "If an unverified account exists for that email, a verification email will be sent.",
            resendAvailableAt: new Date(
              lastSentAt + 60_000
            ).toISOString(),
          });
      }

      const verification =
        createEmailVerificationToken();
      const sentAt =
        new Date().toISOString();

      let updateQuery = supabase
        .from("users")
        .update({
          email_verification_required: true,
          email_verification_token_hash:
            verification.tokenHash,
          email_verification_expires_at:
            verification.expiresAt,
          email_verification_sent_at:
            sentAt,
        })
        .eq("id", user.id);

      updateQuery = user.email_verification_sent_at
        ? updateQuery.lt(
            "email_verification_sent_at",
            new Date(Date.now() - 60_000).toISOString()
          )
        : updateQuery.is(
            "email_verification_sent_at",
            null
          );

      const {
        data: updatedUser,
        error: updateError,
      } = await updateQuery
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error(
          "Prepare verification resend failed:",
          updateError
        );

        return response
          .status(500)
          .json({
            message:
              "Verification email could not be requested. Try again.",
          });
      }

      if (!updatedUser) {
          return response
            .status(202)
            .json({
              message:
                "If an unverified account exists for that email, a verification email will be sent.",
              resendAvailableAt: new Date(
                lastSentAt + 60_000
              ).toISOString(),
            });
      }

      let delivery;

      try {
        delivery = await sendVerificationEmail({
          email: user.email,
          name: user.name,
          token: verification.token,
        });
      } catch (deliveryError) {
        console.error(
          "Verification resend email failed:",
          deliveryError.message
        );

        const { error: resetCooldownError } =
          await supabase
            .from("users")
            .update({
              email_verification_sent_at:
                new Date(Date.now() - 60_001).toISOString(),
            })
            .eq("id", user.id)
            .eq(
              "email_verification_token_hash",
              verification.tokenHash
            );

        if (resetCooldownError) {
          console.error(
            "Reset failed verification resend cooldown:",
            resetCooldownError
          );
        }

        return response
          .status(503)
          .json({
            message:
              "Verification email could not be sent right now. Check the backend email settings and try again later.",
          });
      }

      return response
        .status(202)
        .json({
          message: delivery.previewUrl
            ? "Local test verification link created."
            : "If an unverified account exists for that email, a verification email will be sent.",
          ...(delivery.previewUrl
            ? {
                verificationPreviewUrl:
                  delivery.previewUrl,
              }
            : {}),
          resendAvailableAt: new Date(
            Date.parse(sentAt) + 60_000
          ).toISOString(),
        });
    } catch (error) {
      console.error(
        "Verification resend error:",
        error.message
      );

      return response
        .status(500)
        .json({
          message:
            "Verification email could not be requested. Try again.",
        });
    }
  }
);

router.post(
  "/login",
  async (request, response) => {
    try {
      const email = normalize(
        request.body.email
      );

      const password = String(
        request.body.password || ""
      );

      if (!email || !password) {
        return response
          .status(400)
          .json({
            message:
              "Email and password are required",
          });
      }

      const {
        data: databaseUser,
        error: selectError,
      } = await supabase
        .from("users")
        .select(
          `
            id,
            name,
            email,
            password_hash,
            role,
            interests,
            shipping_info,
            email_verified,
            email_verification_required,
            is_active,
            created_at,
            updated_at
          `
        )
        .eq("email", email)
        .maybeSingle();

      if (selectError) {
        console.error(
          "Supabase login query error:",
          selectError
        );

        return response
          .status(500)
          .json({
            message:
              "Login could not be completed",
          });
      }

      if (!databaseUser) {
        return response
          .status(401)
          .json({
            message:
              "Invalid email or password",
          });
      }

      if (
        databaseUser.is_active ===
        false
      ) {
        return response
          .status(403)
          .json({
            message:
              "This account is disabled",
          });
      }

      const passwordMatches =
        await bcrypt.compare(
          password,
          databaseUser.password_hash
        );

      if (!passwordMatches) {
        return response
          .status(401)
          .json({
            message:
              "Invalid email or password",
          });
      }

      if (
        databaseUser.email_verification_required &&
        !databaseUser.email_verified
      ) {
        return response
          .status(403)
          .json({
            message:
              "Please verify your email before logging in. You can request another verification email below.",
          });
      }

      const user =
        mapUser(databaseUser);

      const token =
        createAccessToken(user);

      return response.json({
        message:
          "Login successful",
        token,
        user: publicUser(user),
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      return response
        .status(500)
        .json({
          message: "Login failed",
        });
    }
  }
);

export default router;