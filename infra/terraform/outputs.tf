output "public_ip" {
  value = azurerm_public_ip.main.ip_address
}

output "fqdn" {
  description = "Nazwa DNS nadana przez Azure"
  value       = azurerm_public_ip.main.fqdn
}

output "app_domain" {
  description = "Domena aplikacji (bez https://) – wpisz ją jako sekret VM_HOST"
  value       = local.domain
}

output "ssh_command" {
  value = "ssh -i ${var.ssh_private_key_path} ${var.admin_username}@${azurerm_public_ip.main.ip_address}"
}
