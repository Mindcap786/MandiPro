import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../main_container.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _signIn() async {
    setState(() => _isLoading = true);
    try {
      final response = await Supabase.instance.client.auth.signInWithPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );

      if (response.user != null) {
        // Save Session for Offline Access
        final settingsBox = Hive.box('settings');
        await settingsBox.put('is_logged_in', true);
        await settingsBox.put('session_user_email', response.user!.email);

        if (mounted) {
           Navigator.pushReplacement(
             context, 
             MaterialPageRoute(builder: (_) => const MainContainer())
           );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Error: $e"), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
             Text(
               "MandiOS", 
               style: GoogleFonts.robotoMono(fontSize: 40, fontWeight: FontWeight.bold, color: const Color(0xFF00FF00)),
               textAlign: TextAlign.center,
             ),
             const SizedBox(height: 48),
             TextField(
               controller: _emailController,
               style: const TextStyle(color: Colors.white),
               decoration: const InputDecoration(
                 labelText: "Email",
                 labelStyle: TextStyle(color: Colors.grey),
                 enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                 focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF00FF00))),
               ),
             ),
             const SizedBox(height: 16),
             TextField(
               controller: _passwordController,
               obscureText: true,
               style: const TextStyle(color: Colors.white),
               decoration: const InputDecoration(
                 labelText: "Password",
                 labelStyle: TextStyle(color: Colors.grey),
                 enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                 focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF00FF00))),
               ),
             ),
             const SizedBox(height: 32),
             ElevatedButton(
               onPressed: _isLoading ? null : _signIn,
               style: ElevatedButton.styleFrom(
                 backgroundColor: const Color(0xFF00FF00),
                 foregroundColor: Colors.black,
                 padding: const EdgeInsets.symmetric(vertical: 16),
               ),
               child: _isLoading 
                 ? const CircularProgressIndicator(color: Colors.black) 
                 : const Text("LOGIN", style: TextStyle(fontWeight: FontWeight.bold)),
             )
          ],
        ),
      ),
    );
  }
}
