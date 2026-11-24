variable "subscription_id" {
  description = "ID subskrypcji Azure (az account show --query id -o tsv)"
  type        = string
}

variable "dns_label" {
  description = "Unikalna nazwa DNS, np. dzielmy-jkowalski -> dzielmy-jkowalski.<region>.cloudapp.azure.com"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,61}[a-z0-9]$", var.dns_label))
    error_message = "dns_label: małe litery, cyfry i myślniki, zaczyna się literą (3–63 znaki)."
  }
}

variable "acme_email" {
  description = "Twój e-mail – do certyfikatów HTTPS (Let's Encrypt / ZeroSSL)"
  type        = string
}

variable "custom_domain" {
  description = "Opcjonalnie własna domena (np. dzielmy-jan.duckdns.org) zamiast <dns_label>.<region>.cloudapp.azure.com"
  type        = string
  default     = ""
}

variable "project" {
  description = "Prefiks nazw zasobów"
  type        = string
  default     = "dzielmy"
}

variable "location" {
  description = "Region Azure"
  type        = string
  default     = "polandcentral"
}

variable "vm_size" {
  description = "Rozmiar maszyny wirtualnej"
  type        = string
  default     = "Standard_B1s"
}

variable "admin_username" {
  description = "Użytkownik administracyjny na maszynie"
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Ścieżka do klucza publicznego SSH"
  type        = string
  default     = "~/.ssh/dzielmy.pub"
}

variable "ssh_private_key_path" {
  description = "Ścieżka do klucza prywatnego SSH (trafia tylko do inventory Ansible)"
  type        = string
  default     = "~/.ssh/dzielmy"
}

variable "ssh_source_cidr" {
  description = "Skąd wolno łączyć się przez SSH. '*' jest potrzebne, żeby GitHub Actions mógł wdrażać aplikację."
  type        = string
  default     = "*"
}
